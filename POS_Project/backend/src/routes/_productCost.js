const db = require("../database/dbHelper");

const hasValue = (value) => value !== undefined && value !== null && value !== "";

function normalizeCost(value) {
  if (!hasValue(value)) return null;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

async function applyPendingCostIfInventoryEmpty(productId, storeId, quantity) {
  if (parseInt(quantity, 10) > 0) return false;

  const product = await db.get(
    "SELECT pending_cost_price FROM products WHERE id=? AND store_id=?",
    [productId, storeId]
  );

  if (!product || product.pending_cost_price === null || product.pending_cost_price === undefined) {
    return false;
  }

  await db.run(
    "UPDATE products SET cost_price=pending_cost_price, pending_cost_price=NULL, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
    [productId, storeId]
  );

  return true;
}

async function queueOrApplyProductCost(productId, storeId, quantityBeforeReceive, nextCost) {
  const normalizedCost = normalizeCost(nextCost);
  if (normalizedCost === null) return { mode: "unchanged", cost: null };

  if (parseInt(quantityBeforeReceive, 10) <= 0) {
    await db.run(
      "UPDATE products SET cost_price=?, pending_cost_price=NULL, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?",
      [normalizedCost, productId, storeId]
    );
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
