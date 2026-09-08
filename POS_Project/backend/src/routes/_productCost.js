const db = require("../database/dbHelper");

const hasValue = (value) => value !== undefined && value !== null && value !== "";

function normalizeCost(value) {
  if (!hasValue(value)) return null;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

async function applyPendingCostIfInventoryEmpty(productId, storeId, quantity, userId = null) {
  const product = await db.get(
    "SELECT cost_price, pending_cost_price FROM products WHERE id=? AND store_id=?",
    [productId, storeId]
  );

  if (!product || product.pending_cost_price === null || product.pending_cost_price === undefined) {
    return false;
  }

  // Find the quantity of the last receive transaction to see if the old stock is depleted
  const lastReceive = await db.get(
    "SELECT quantity FROM stock_transactions WHERE product_id = ? AND type = 'receive' AND store_id = ? ORDER BY created_at DESC LIMIT 1",
    [productId, storeId]
  );

  const currentQty = parseInt(quantity, 10);
  const receiveQty = lastReceive ? parseInt(lastReceive.quantity, 10) : 0;

  // Apply pending cost if total stock is 0 or less, OR if we have sold down to or below the newly received quantity (FIFO depletion)
  if (currentQty > 0 && currentQty > receiveQty) {
    return false;
  }

  const { v4: uuidv4 } = require("uuid");
  let finalUserId = userId;
  if (!finalUserId) {
    const firstUser = await db.get("SELECT id FROM users LIMIT 1");
    finalUserId = firstUser ? firstUser.id : null;
  }

  if (finalUserId) {
    const oldCostStr = Number(product.cost_price).toFixed(2);
    const newCostStr = Number(product.pending_cost_price).toFixed(2);
    const remark = `ปรับต้นทุนอัตโนมัติ: ฿${oldCostStr} ➔ ฿${newCostStr} (สินค้าเก่าหมด)`;
    
    await db.run(
      "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark) VALUES (?, ?, ?, ?, 'adjust', 0, ?)",
      [uuidv4(), productId, finalUserId, storeId, remark]
    );
  }

  await db.run(
    "UPDATE products SET cost_price=pending_cost_price, pending_cost_price=NULL, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
    [productId, storeId]
  );

  return true;
}

async function queueOrApplyProductCost(productId, storeId, quantityBeforeReceive, nextCost, userId = null) {
  const normalizedCost = normalizeCost(nextCost);
  if (normalizedCost === null) return { mode: "unchanged", cost: null };

  if (parseInt(quantityBeforeReceive, 10) <= 0) {
    const product = await db.get("SELECT cost_price FROM products WHERE id=? AND store_id=?", [productId, storeId]);
    const oldCost = product ? product.cost_price : null;

    await db.run(
      "UPDATE products SET cost_price=?, pending_cost_price=NULL, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
      [normalizedCost, productId, storeId]
    );

    if (oldCost !== null && oldCost !== normalizedCost) {
      const { v4: uuidv4 } = require("uuid");
      let finalUserId = userId;
      if (!finalUserId) {
        const firstUser = await db.get("SELECT id FROM users LIMIT 1");
        finalUserId = firstUser ? firstUser.id : null;
      }
      if (finalUserId) {
        const oldCostStr = Number(oldCost).toFixed(2);
        const newCostStr = Number(normalizedCost).toFixed(2);
        const remark = `ปรับต้นทุนอัตโนมัติ: ฿${oldCostStr} ➔ ฿${newCostStr} (รับสินค้าขณะสต๊อกเป็น 0)`;
        await db.run(
          "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark) VALUES (?, ?, ?, ?, 'adjust', 0, ?)",
          [uuidv4(), productId, finalUserId, storeId, remark]
        );
      }
    }

    return { mode: "applied", cost: normalizedCost };
  }

  await db.run(
    "UPDATE products SET pending_cost_price=?, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
    [normalizedCost, productId, storeId]
  );
  return { mode: "pending", cost: normalizedCost };
}

module.exports = {
  normalizeCost,
  applyPendingCostIfInventoryEmpty,
  queueOrApplyProductCost,
};
