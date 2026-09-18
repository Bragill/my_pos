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
 *
 * @param {Function} [exec] optional transactional writer: async (sql, params, undo) => result.
 *   When provided, batch updates route through it (with undo info) instead of db directly.
 */
async function deductFromBatches(productId, storeId, qty, exec = null) {
  const _run = exec
    ? (sql, params, undo) => exec(sql, params, undo)
    : (sql, params) => db.run(sql, params);
  try {
    const deductQty = parseFloat(qty) || 0;
    if (!productId || deductQty <= 0) return;
    await ensureSchema();

    const nowIso = new Date().toISOString();
    const batches = await db.all(
      `SELECT id, qty_remaining, status FROM product_batches
       WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')
          AND status = 'active' AND qty_remaining > 0
          AND (expiry_date IS NULL OR expiry_date > ?)
        ORDER BY (expiry_date IS NULL), expiry_date ASC, produced_at ASC`,
      [productId, storeId, nowIso]
    );

    let remainingToDeduct = deductQty;
    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;
      const batchQty = parseFloat(batch.qty_remaining) || 0;
      const take = Math.min(batchQty, remainingToDeduct);
      const newQtyRemaining = Number((batchQty - take).toFixed(4));
      const newStatus = newQtyRemaining <= 0 ? 'depleted' : 'active';

      await _run(
        "UPDATE product_batches SET qty_remaining = ?, status = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [newQtyRemaining, newStatus, batch.id],
        { sql: "UPDATE product_batches SET qty_remaining = ?, status = ? WHERE id = ?", params: [batchQty, batch.status || 'active', batch.id] }
      );

      remainingToDeduct = Number((remainingToDeduct - take).toFixed(4));
    }
  } catch (err) {
    console.error("[batchService] deductFromBatches error:", err.message);
  }
}

/**
 * Restore quantity to production batches upon order cancellation / refund / void.
 * Restores to newest active or depleted batches first whose expiry date has not passed.
 * @param {Function} [exec] optional transactional writer (see deductFromBatches).
 */
async function restoreToBatches(productId, storeId, qty, exec = null) {
  const _run = exec
    ? (sql, params, undo) => exec(sql, params, undo)
    : (sql, params) => db.run(sql, params);
  try {
    const restoreQty = parseFloat(qty) || 0;
    if (!productId || restoreQty <= 0) return;
    await ensureSchema();

    const nowIso = new Date().toISOString();
    const batches = await db.all(
      `SELECT id, qty_produced, qty_remaining FROM product_batches
       WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')
         AND status IN ('active', 'depleted')
         AND (expiry_date IS NULL OR expiry_date > ?)
       ORDER BY produced_at DESC`,
      [productId, storeId, nowIso]
    );

    let remainingToRestore = restoreQty;
    for (const batch of batches) {
      if (remainingToRestore <= 0) break;
      const produced = parseFloat(batch.qty_produced) || 0;
      const current = parseFloat(batch.qty_remaining) || 0;
      const capacity = Math.max(0, produced - current);
      if (capacity <= 0) continue;
      const add = Math.min(capacity, remainingToRestore);
      const newQty = Number((current + add).toFixed(4));
      await _run(
        "UPDATE product_batches SET qty_remaining = ?, status = 'active', updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [newQty, batch.id],
        { sql: "UPDATE product_batches SET qty_remaining = ? WHERE id = ?", params: [current, batch.id] }
      );
      remainingToRestore = Number((remainingToRestore - add).toFixed(4));
    }
  } catch (err) {
    console.error("[batchService] restoreToBatches error:", err.message);
  }
}

/**
 * Scan all active batches whose expiry_date has passed, and remove their remaining
 * quantity from stock automatically. Clamps to current inventory quantity so it can
 * never drive stock negative. Logs a stock_transactions row (type='expired') for audit.
 *
 * ALSO performs reconciliation / self-healing:
 * 1) When a batch expires:
 *    - If no other active batches exist for that product, remaining inventory MUST become 0
 *      (because 100% of production runs for this finished good have expired).
 *    - If other active batches exist, inventory is clamped so it never exceeds the sum of active batches.
 * 2) Self-healing of orphan expired stock:
 *    - If any product has batch tracking (has records in product_batches) and ALL its batches are
 *      expired or depleted (total active, non-expired batch qty = 0), but inventory.quantity > 0:
 *      automatically write off the remaining orphan quantity with type='expired'.
 *    - If active batch qty > 0 but inventory.quantity > active batch qty:
 *      deduct the excess expired stock with type='expired' so inventory stays synchronized with active batches.
 */
async function runExpiryCheck() {
  const nowIso = new Date().toISOString();
  let removedCount = 0;

  try {
    await ensureSchema();

    // Step 1: Scan and expire all active batches whose expiry_date has passed
    const expiredBatches = await db.all(
      `SELECT * FROM product_batches
       WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date <= ?`,
      [nowIso]
    );

    for (const batch of expiredBatches) {
      try {
        const inv = await db.get(
          "SELECT quantity FROM inventory WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [batch.product_id, batch.store_id]
        );
        const currentQty = inv ? (parseFloat(inv.quantity) || 0) : 0;

        // Total active non-expired batch stock remaining for this product (excluding this expiring batch)
        const otherBatches = await db.get(
          `SELECT COALESCE(SUM(qty_remaining), 0) as active_qty
           FROM product_batches
           WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')
             AND id != ? AND status = 'active'
             AND (expiry_date IS NULL OR expiry_date > ?)`,
          [batch.product_id, batch.store_id, batch.id, nowIso]
        );
        const otherActiveQty = otherBatches ? (parseFloat(otherBatches.active_qty) || 0) : 0;

        let removeQty = 0;
        if (otherActiveQty === 0) {
          // No other active batches remain: ALL finished goods stock of this product has expired!
          removeQty = Math.max(0, currentQty);
        } else {
          // Other active batches exist: clamp inventory so it cannot exceed otherActiveQty
          if (currentQty > otherActiveQty) {
            removeQty = Number((currentQty - otherActiveQty).toFixed(4));
          } else {
            removeQty = Math.min(parseFloat(batch.qty_remaining) || 0, currentQty);
          }
        }

        if (removeQty > 0) {
          await db.run(
            "UPDATE inventory SET quantity = MAX(0, quantity - ?), updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
            [removeQty, batch.product_id, batch.store_id]
          );

          await db.run(
            "UPDATE ingredients SET quantity = MAX(0, quantity - ?), updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = (SELECT sku FROM products WHERE id = ?)) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
            [removeQty, batch.product_id, batch.product_id, batch.store_id]
          ).catch(() => {});

          await db.run(
            `INSERT INTO stock_transactions (id, store_id, product_id, user_id, type, quantity, remark, created_at)
             VALUES (?, ?, ?, 'system', 'expired', ?, ?, datetime('now', '+7 hours'))`,
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

    // Step 2: Automated Self-Healing Reconciliation for batch-tracked products
    // Detects any product with batch tracking whose inventory does not match valid active batches (excess or negative phantom stock)
    const orphanProducts = await db.all(
      `SELECT p.id as product_id, p.sku, p.name, i.store_id, i.quantity,
              COALESCE((
                SELECT SUM(b.qty_remaining)
                FROM product_batches b
                WHERE b.product_id = p.id AND (b.store_id = i.store_id OR b.store_id IS NULL OR b.store_id = '')
                  AND b.status = 'active' AND (b.expiry_date IS NULL OR b.expiry_date > ?)
              ), 0) as valid_active_qty
       FROM products p
       JOIN inventory i ON p.id = i.product_id
       WHERE (SELECT COUNT(*) FROM product_batches b WHERE b.product_id = p.id AND (b.store_id = i.store_id OR b.store_id IS NULL OR b.store_id = '')) > 0`,
      [nowIso]
    );

    for (const orphan of orphanProducts) {
      const currentQty = parseFloat(orphan.quantity) || 0;
      const validQty = parseFloat(orphan.valid_active_qty) || 0;
      const diffQty = Number((currentQty - validQty).toFixed(4));

      // If currentQty > validQty (orphan/expired stock left in inventory)
      // OR currentQty < 0 (negative phantom inventory on batch-tracked products)
      if (diffQty > 0 || (currentQty < 0 && validQty >= 0)) {
        try {
          const adjQty = Number((validQty - currentQty).toFixed(4));
          await db.run(
            "UPDATE inventory SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE product_id = ? AND store_id = ?",
            [validQty, orphan.product_id, orphan.store_id]
          );

          await db.run(
            "UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR sku = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
            [validQty, orphan.product_id, orphan.sku, orphan.store_id]
          ).catch(() => {});

          const isNegativeFix = currentQty < 0;
          const remark = isNegativeFix
            ? `ปรับปรุงยอดคงเหลือไม่ให้ติดลบสำหรับสินค้าล็อตผลิต (${currentQty} → ${validQty})`
            : (validQty === 0
                ? `สินค้าหมดอายุอัตโนมัติ (ล็อตผลิตทั้งหมดหมดอายุแล้ว)`
                : `ปรับลดยอดสินค้าหมดอายุตกค้าง (${currentQty} → ${validQty})`);

          await db.run(
            `INSERT INTO stock_transactions (id, store_id, product_id, user_id, type, quantity, remark, created_at)
             VALUES (?, ?, ?, 'system', ?, ?, ?, datetime('now', '+7 hours'))`,
            [uuidv4(), orphan.store_id, orphan.product_id, isNegativeFix ? 'adjust' : 'expired', isNegativeFix ? adjQty : -diffQty, remark]
          );

          removedCount++;
          console.log(`[batchService] Auto-healed stock for product ${orphan.sku} (${orphan.name}): adj ${adjQty}, new stock = ${validQty}`);
        } catch (healErr) {
          console.error(`[batchService] error healing stock for ${orphan.sku}:`, healErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[batchService] runExpiryCheck error:", err.message);
  }

  if (removedCount > 0) {
    console.log(`[batchService] Auto-removed/reconciled stock for ${removedCount} item(s)/batch(es).`);
  }
  return removedCount;
}

module.exports = { createBatch, deductFromBatches, restoreToBatches, runExpiryCheck };
