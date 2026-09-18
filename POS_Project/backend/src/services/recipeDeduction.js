const db = require("../database/dbHelper");

// Canonical unit helpers (parity with routes/recipes.js)
function getUnitFamily(unitStr) {
  if (!unitStr) return 'count';
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล', 'g', 'กรัม', 'ก.', 'mg', 'มิลลิกรัม', 'oz', 'ออนซ์', 'lb', 'ปอนด์'].includes(u)) {
    return 'weight';
  }
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล', 'l', 'ลิตร'].includes(u)) {
    return 'volume';
  }
  return 'count';
}

function getUnitFactor(unitStr) {
  if (!unitStr) return 1;
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(u)) return 1000;
  if (['g', 'กรัม', 'ก.'].includes(u)) return 1;
  if (['mg', 'มิลลิกรัม'].includes(u)) return 0.001;
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(u)) return 1;
  if (['l', 'ลิตร'].includes(u)) return 1000;
  if (['oz', 'ออนซ์'].includes(u)) return 28.3495;
  if (['lb', 'ปอนด์'].includes(u)) return 453.592;
  return 1;
}

function convertQuantity(qty, fromUnit, toUnit) {
  const numQty = parseFloat(qty) || 0;
  if (numQty === 0) return 0;
  const fromFamily = getUnitFamily(fromUnit);
  const toFamily = getUnitFamily(toUnit);
  if (fromFamily !== toFamily || fromFamily === 'count') {
    return numQty;
  }
  const fromFactor = getUnitFactor(fromUnit);
  const toFactor = getUnitFactor(toUnit);
  if (fromFactor === toFactor) return numQty;
  return numQty * (fromFactor / toFactor);
}

// Lazy self-healing columns (safe to call per request; no-op after first success)
let deductionColsReady = false;
async function ensureRecipeDeductionColumns() {
  if (deductionColsReady) return;
  try {
    await db.run("ALTER TABLE order_items ADD COLUMN recipe_deducted TEXT");
  } catch (_) {
    // Column already exists
  }
  try {
    await db.run("ALTER TABLE products ADD COLUMN deduct_recipe_on_sale INTEGER DEFAULT 0");
  } catch (_) {
    // Column already exists
  }
  try {
    await db.run("ALTER TABLE products ADD COLUMN yield_unit TEXT");
  } catch (_) {
    // Column already exists
  }
  try {
    await db.run("ALTER TABLE order_items ADD COLUMN finished_deducted REAL");
  } catch (_) {
    // Column already exists
  }
  try {
    // Backfill: keep current behavior for products that already have a recipe.
    // New products default to 0 (opt-in via checkbox in recipe editor).
    await db.run(
      "UPDATE products SET deduct_recipe_on_sale = 1 WHERE deduct_recipe_on_sale IS NULL AND EXISTS (SELECT 1 FROM recipes r WHERE r.product_id = products.id)"
    );
  } catch (_) {}
  deductionColsReady = true;
}

// Back-compat alias
async function ensureRecipeDeductedColumn() {
  return ensureRecipeDeductionColumns();
}

/**
 * Recursively explode a product's BOM into raw-leaf ingredient requirements.
 * Scales by portion (per-sale-unit qty = batchQty / portionQty).
 * Cycle-safe via `visited` set. Depth-capped at 10.
 *
 * @returns [{ ingredient_id, name, qty (in ingredient base unit), unit, recipe_unit }]
 */
async function explodeBom(productId, unitsToMake, storeId, visited = new Set(), depth = 0) {
  if (depth > 10 || visited.has(productId)) return [];
  visited.add(productId);

  const product = await db.get(
    "SELECT id, name, recipe_yield, portion_count FROM products WHERE id = ?",
    [productId]
  );
  const portionQty = Math.max(
    0.0001,
    parseFloat(product?.portion_count) || parseFloat(product?.recipe_yield) || 1
  );

  const rows = await db.all(
    `SELECT r.ingredient_id, r.quantity, r.unit as recipe_unit,
            COALESCE(i.name, p.name) as ingredient_name,
            COALESCE(i.unit, p.unit, 'ชิ้น') as ing_unit
     FROM recipes r
     LEFT JOIN ingredients i ON r.ingredient_id = i.id
     LEFT JOIN products p ON r.ingredient_id = p.id
     WHERE r.product_id = ? AND (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
    [productId, storeId]
  );

  const leaves = [];
  for (const row of rows) {
    const batchQty = parseFloat(row.quantity) || 0;
    if (batchQty <= 0 || !row.ingredient_id) continue;
    // Per-sale-unit quantity, then scaled by units actually shortfall-made
    const perUnitQty = batchQty / portionQty;
    const requiredRecipeUnit = perUnitQty * unitsToMake;
    if (requiredRecipeUnit <= 0) continue;

    // If this item is tracked in ingredients or inventory, treat it as a direct stocked leaf.
    // Only recurse into sub-recipes for virtual bundles / unstocked sub-assemblies.
    const ingRow = await db.get(
      "SELECT id FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [row.ingredient_id, storeId]
    );
    const hasDirectStock = ingRow || (await db.get(
      "SELECT id FROM inventory WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [row.ingredient_id, storeId]
    ));

    if (!hasDirectStock) {
      const childCount = await db.get(
        "SELECT COUNT(*) as c FROM recipes WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [row.ingredient_id, storeId]
      );
      if (childCount && childCount.c > 0) {
        // Child BOM is defined per ITS batch; convert needed qty into child "units"
        const childProd = await db.get(
          "SELECT portion_count, recipe_yield FROM products WHERE id = ?",
          [row.ingredient_id]
        );
        const childPortion = Math.max(
          0.0001,
          parseFloat(childProd?.portion_count) || parseFloat(childProd?.recipe_yield) || 1
        );
        const childUnits = requiredRecipeUnit / childPortion;
        const nested = await explodeBom(row.ingredient_id, childUnits, storeId, new Set(visited), depth + 1);
        leaves.push(...nested);
        continue;
      }
    }

    const ingUnit = row.ing_unit || row.recipe_unit || 'ชิ้น';
    const qtyInIngUnit = Number(convertQuantity(requiredRecipeUnit, row.recipe_unit, ingUnit).toFixed(4));
    leaves.push({
      ingredient_id: row.ingredient_id,
      name: row.ingredient_name || row.ingredient_id,
      qty: qtyInIngUnit,
      unit: ingUnit,
      recipe_unit: row.recipe_unit,
    });
  }
  return leaves;
}

async function getIngredientAvailableStock(ingredientId, storeId) {
  const ingRow = await db.get(
    "SELECT quantity FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
    [ingredientId, storeId]
  );
  if (ingRow && ingRow.quantity !== null && ingRow.quantity !== undefined) {
    return parseFloat(ingRow.quantity) || 0;
  }
  const prodRow = await db.get(
    "SELECT quantity FROM inventory WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
    [ingredientId, storeId]
  );
  return prodRow ? (parseFloat(prodRow.quantity) || 0) : 0;
}

/**
 * Calculate how many units of a product can be made from currently available raw ingredients.
 * Returns { maxProduceQty, limitingIngredient: { name, stock, requiredPerUnit, unit } }
 */
async function calculateMaxProduceQty(productId, storeId) {
  const leaves = await explodeBom(productId, 1, storeId);
  if (!leaves || leaves.length === 0) {
    return { maxProduceQty: 0, limitingIngredient: null };
  }

  const reqMap = new Map();
  for (const leaf of leaves) {
    const key = leaf.ingredient_id;
    if (!reqMap.has(key)) {
      reqMap.set(key, { ...leaf, totalQtyPerUnit: 0 });
    }
    reqMap.get(key).totalQtyPerUnit += leaf.qty;
  }

  let minProduce = Infinity;
  let bottleneck = null;

  for (const item of reqMap.values()) {
    if (item.totalQtyPerUnit <= 0) continue;
    const stock = await getIngredientAvailableStock(item.ingredient_id, storeId);
    const canMake = Math.floor(stock / item.totalQtyPerUnit);
    if (canMake < minProduce) {
      minProduce = canMake;
      bottleneck = {
        ingredient_id: item.ingredient_id,
        name: item.name,
        stock: stock,
        unit: item.unit,
        requiredPerUnit: item.totalQtyPerUnit
      };
    }
  }

  const finalProduce = minProduce === Infinity ? 0 : Math.max(0, minProduce);
  return { maxProduceQty: finalProduce, limitingIngredient: bottleneck };
}

/**
 * Finished-stock-first sale deduction planner (READ phase only — no writes).
 *
 * For each order line:
 *   finished deduct   = full saleQty (existing behavior; may go negative)
 *   shortfall         = max(0, saleQty - max(0, finishedBefore))
 *   if shortfall > 0 AND product has a recipe → explode BOM for shortfall units
 *
 * Stock may go negative (warn-not-block): shortages are collected as warnings,
 * the sale still completes.
 *
 * @param {Array<{product_id, quantity, product_name}>} items
 * @returns { lines: [{ product_id, quantity, finished_before, shortfall, recipe_leaves }],
 *            requirements: Map ingredient_id -> { ingredient_id, name, unit, total_qty, stock },
 *            warnings: [{ type, ingredient_id?, name, required, stock, missing, unit, message }] }
 */
async function planSaleDeduction(items, storeId) {
  await ensureRecipeDeductionColumns();
  const lines = [];
  const agg = new Map();
  const warnings = [];

  for (const item of items) {
    const saleQty = parseFloat(item.quantity) || 0;
    const inv = await db.get(
      "SELECT quantity FROM inventory WHERE product_id = ? AND store_id = ?",
      [item.product_id, storeId]
    );
    const finishedBefore = inv ? parseFloat(inv.quantity) || 0 : 0;
    const shortfall = Math.max(0, saleQty - Math.max(0, finishedBefore));

    // Opt-in per product: only deduct recipe when the product's
    // "deduct_recipe_on_sale" checkbox is enabled (Tab ผูกสูตรขาย POS).
    let deductEnabled = false;
    try {
      const flagRow = await db.get("SELECT deduct_recipe_on_sale FROM products WHERE id = ?", [item.product_id]);
      deductEnabled = !!flagRow && (flagRow.deduct_recipe_on_sale === 1 || flagRow.deduct_recipe_on_sale === true);
    } catch (_) {
      deductEnabled = false;
    }

    let leaves = [];
    if (shortfall > 0 && deductEnabled) {
      const recipeCount = await db.get(
        "SELECT COUNT(*) as c FROM recipes WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [item.product_id, storeId]
      );
      if (recipeCount && recipeCount.c > 0) {
        leaves = await explodeBom(item.product_id, shortfall, storeId);
      }
    }

    lines.push({
      product_id: item.product_id,
      product_name: item.product_name || item.product_id,
      quantity: saleQty,
      finished_before: finishedBefore,
      shortfall,
      deduct_enabled: deductEnabled,
      recipe_leaves: leaves,
    });

    for (const leaf of leaves) {
      const key = leaf.ingredient_id;
      if (!agg.has(key)) {
        const stock = await getIngredientAvailableStock(key, storeId);
        agg.set(key, {
          ingredient_id: key,
          name: leaf.name,
          unit: leaf.unit,
          total_qty: 0,
          stock: stock,
        });
      }
      const entry = agg.get(key);
      entry.total_qty = Number((entry.total_qty + leaf.qty).toFixed(4));
    }
  }

  for (const entry of agg.values()) {
    if (entry.total_qty > entry.stock) {
      const missing = Number((entry.total_qty - entry.stock).toFixed(4));
      warnings.push({
        type: 'ingredient_shortage',
        ingredient_id: entry.ingredient_id,
        name: entry.name,
        required: entry.total_qty,
        stock: entry.stock,
        missing,
        unit: entry.unit,
        message: `วัตถุดิบ "${entry.name}" ไม่พอ: ต้องใช้ ${entry.total_qty} ${entry.unit} มี ${entry.stock} ${entry.unit} (ขาด ${missing} ${entry.unit}, ยอดจะติดลบ)`,
      });
    }
  }

  return { lines, requirements: Array.from(agg.values()), warnings };
}

/**
 * Build the hard-block error message for insufficient raw materials.
 * Returns null when there is no shortage.
 */
function formatShortageMessage(warnings = []) {
  if (!warnings || warnings.length === 0) return null;
  const parts = warnings.map(
    (w) => `"${w.name}" (ต้องใช้ ${w.required} ${w.unit} มี ${w.stock} ${w.unit} ขาด ${w.missing} ${w.unit})`
  );
  return `วัตถุดิบไม่เพียงพอ ไม่สามารถขายได้: ${parts.join(', ')}`;
}

module.exports = {
  getUnitFamily,
  getUnitFactor,
  convertQuantity,
  ensureRecipeDeductionColumns,
  ensureRecipeDeductedColumn,
  explodeBom,
  getIngredientAvailableStock,
  calculateMaxProduceQty,
  planSaleDeduction,
  formatShortageMessage,
};
