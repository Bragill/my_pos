const db = require("../database/dbHelper");
const { v4: uuidv4 } = require("uuid");

// --- Self-migrating schema (lazy initialized on first use inside worker/request context) ---
let schemaInitialized = false;
async function ensureSchema() {
  if (schemaInitialized) return;
  schemaInitialized = true;
  await db.run("ALTER TABLE products ADD COLUMN shelf_life_days INTEGER").catch(() => {});
  await db.run(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      wo_id TEXT,
      wo_number TEXT,
      qty_produced REAL NOT NULL,
      qty_remaining REAL NOT NULL,
      unit TEXT NOT NULL,
      produced_at TEXT NOT NULL,
      expiry_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      expired_at TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).catch(() => {});
}

/**
 * Create a new production batch record for a finished good.
 * If the product has no shelf_life_days configured, the batch is still recorded
 * (for FIFO quantity tracking) but with expiry_date = NULL, so it will never
 * be auto-expired by runExpiryCheck().
 */
async function createBatch({ productId, storeId, woId, woNumber, qty, unit, producedAt }) {
  try {
    if (!productId || !qty || qty <= 0) return null;
    await ensureSchema();

    const product = await db.get("SELECT shelf_life_days FROM products WHERE id = ?", [productId]);
    const shelfLifeDays = product && product.shelf_life_days != null ? parseInt(product.shelf_life_days, 10) : null;

    const producedAtDate = producedAt || new Date().toISOString();
    let expiryDate = null;
    if (shelfLifeDays && shelfLifeDays > 0) {
      const d = new Date(producedAtDate);
      d.setDate(d.getDate() + shelfLifeDays);
      expiryDate = d.toISOString();
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO product_batches
        (id, product_id, store_id, wo_id, wo_number, qty_produced, qty_remaining, unit, produced_at, expiry_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, productId, storeId, woId || null, woNumber || null, qty, qty, unit || 'หน่วย', producedAtDate, expiryDate]
    );

    return { id, expiry_date: expiryDate, shelf_life_days: shelfLifeDays };
  } catch (err) {
    console.error("[batchService] createBatch error:", err.message);
    return null;
  }
}

/**
 * Best-effort FIFO deduction across a product's active batches (oldest expiry / oldest produced first).
 * Never throws - stock decrements that trigger this must never be blocked by batch bookkeeping.
 * If qty exceeds tracked batch quantity (e.g. stock predates batch tracking or was received manually),
 * it simply stops once batches run out.
 */
async function deductFromBatches(productId, storeId, qty) {
  try {
    const deductQty = parseFloat(qty) || 0;
    if (!productId || deductQty <= 0) return;

    const batches = await db.all(
      `SELECT id, qty_remaining FROM product_batches
       WHERE product_id = ? AND store_id = ? AND status = 'active' AND qty_remaining > 0
       ORDER BY (expiry_date IS NULL), expiry_date ASC, produced_at ASC`,
      [productId, storeId]
    );

    let remainingToDeduct = deductQty;
    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;
      const batchQty = parseFloat(batch.qty_remaining) || 0;
      const take = Math.min(batchQty, remainingToDeduct);
      const newQtyRemaining = Number((batchQty - take).toFixed(4));
      const newStatus = newQtyRemaining <= 0 ? 'depleted' : 'active';

      await db.run(
        "UPDATE product_batches SET qty_remaining = ?, status = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [newQtyRemaining, newStatus, batch.id]
      );

      remainingToDeduct = Number((remainingToDeduct - take).toFixed(4));
    }
  } catch (err) {
    console.error("[batchService] deductFromBatches error:", err.message);
  }
}

/**
 * Scan all active batches whose expiry_date has passed, and remove their remaining
 * quantity from stock automatically. Clamps to current inventory quantity so it can
 * never drive stock negative. Logs a stock_transactions row (type='expired') for audit.
 */
async function runExpiryCheck() {
  const nowIso = new Date().toISOString();
  let removedCount = 0;

  try {
    await ensureSchema();
    const expiredBatches = await db.all(
      `SELECT * FROM product_batches
       WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date <= ? AND qty_remaining > 0`,
      [nowIso]
    );

    for (const batch of expiredBatches) {
      try {
        const inv = await db.get(
          "SELECT quantity FROM inventory WHERE product_id = ? AND store_id = ?",
          [batch.product_id, batch.store_id]
        );
        const currentQty = inv ? (parseFloat(inv.quantity) || 0) : 0;
        const removeQty = Math.min(parseFloat(batch.qty_remaining) || 0, currentQty);

        if (removeQty > 0) {
          await db.run(
            "UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND store_id = ?",
            [removeQty, batch.product_id, batch.store_id]
          );

          await db.run(
            `INSERT INTO stock_transactions (id, store_id, product_id, user_id, type, quantity, remark)
             VALUES (?, ?, ?, 'system', 'expired', ?, ?)`,
            [uuidv4(), batch.store_id, batch.product_id, -removeQty, `สินค้าหมดอายุอัตโนมัติ - Batch ${batch.wo_number || batch.id}`]
          );
        }

        await db.run(
          "UPDATE product_batches SET status = 'expired', qty_remaining = 0, expired_at = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [nowIso, batch.id]
        );

        removedCount++;
      } catch (innerErr) {
        console.error(`[batchService] error expiring batch ${batch.id}:`, innerErr.message);
      }
    }
  } catch (err) {
    console.error("[batchService] runExpiryCheck error:", err.message);
  }

  if (removedCount > 0) {
    console.log(`[batchService] Auto-removed stock for ${removedCount} expired batch(es).`);
  }
  return removedCount;
}

module.exports = { createBatch, deductFromBatches, runExpiryCheck };
