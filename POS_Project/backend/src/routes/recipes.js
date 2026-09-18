const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const batchService = require("../services/batchService");
const { isLineApprovalRequired, cancelWorkOrder } = require("../services/cancellationService");
const lineService = require("../services/lineService");
const { ensureRecipeDeductionColumns } = require("../services/recipeDeduction");
const router = express.Router();

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

function calculateRecipeItemCost(qty, recipeUnit, ingUnit, ingCostPerUnit) {
  const rFactor = getUnitFactor(recipeUnit);
  const iFactor = getUnitFactor(ingUnit);
  let effectiveCost = ingCostPerUnit;
  if (rFactor > 0 && iFactor > 0 && rFactor !== iFactor) {
    effectiveCost = ingCostPerUnit * (rFactor / iFactor);
  }
  return {
    effective_cost_per_unit: Number(effectiveCost.toFixed(4)),
    item_cost: qty * effectiveCost
  };
}

// GET recipe for a specific product
router.get("/product/:productId", authenticate, async (req, res, next) => {
  try {
    await ensureRecipeDeductionColumns().catch(() => {});
    const product = await db.get(
      `SELECT id, name, sku, cost_price, selling_price, recipe_name, recipe_yield, portion_count, portion_unit, shelf_life_days, deduct_recipe_on_sale, yield_unit,
              (SELECT ar.id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || products.id || '"%' OR ar.document_id = products.id) LIMIT 1) as pending_adjust_id,
              (SELECT ar.document_id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || products.id || '"%' OR ar.document_id = products.id) LIMIT 1) as pending_adjust_doc
       FROM products 
       WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')`,
      [req.store_id, req.store_id, req.params.productId, req.store_id]
    );

    if (!product) return next(new AppError("ไม่พบข้อมูลสินค้า", 404));

    const recipeItems = await db.all(
      `SELECT r.id, r.product_id, r.ingredient_id, r.quantity, r.unit,
              COALESCE(i.name, p.name) as ingredient_name,
              COALESCE(i.unit, p.unit, 'ชิ้น') as ingredient_unit,
              COALESCE(i.cost_per_unit, p.cost_price, 0) as cost_per_unit,
              COALESCE(i.quantity, 0) as stock_quantity,
              (SELECT ar.id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || r.ingredient_id || '"%' OR ar.document_id = r.ingredient_id) LIMIT 1) as pending_adjust_id,
              (SELECT ar.document_id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || r.ingredient_id || '"%' OR ar.document_id = r.ingredient_id) LIMIT 1) as pending_adjust_doc
       FROM recipes r
       LEFT JOIN ingredients i ON r.ingredient_id = i.id
       LEFT JOIN products p ON r.ingredient_id = p.id
       WHERE r.product_id = ? AND (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
      [req.store_id, req.store_id, req.params.productId, req.store_id]
    );

    const formattedItems = [];
    let calculatedCost = 0;

    for (const item of recipeItems) {
      let activeCostPerUnit = item.cost_per_unit;
      let subRecipeData = null;

      // Check if this ingredient has its own sub-recipe in recipes table
      const subItems = await db.all(
        `SELECT r.quantity, r.unit,
                COALESCE(i.name, p.name) as ingredient_name,
                COALESCE(i.unit, p.unit, 'ชิ้น') as ingredient_unit,
                COALESCE(i.cost_per_unit, p.cost_price, 0) as cost_per_unit
         FROM recipes r
         LEFT JOIN ingredients i ON r.ingredient_id = i.id
         LEFT JOIN products p ON r.ingredient_id = p.id
         WHERE r.product_id = ? AND (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
        [item.ingredient_id, req.store_id]
      );

      if (subItems && subItems.length > 0) {
        const subProd = await db.get(
          "SELECT recipe_name, recipe_yield, portion_count, portion_unit FROM products WHERE id = ?",
          [item.ingredient_id]
        );
        let subBatchCost = 0;
        const formattedSubItems = subItems.map(sub => {
          const subCalc = calculateRecipeItemCost(sub.quantity, sub.unit || sub.ingredient_unit, sub.ingredient_unit, sub.cost_per_unit);
          subBatchCost += subCalc.item_cost;
          return {
            name: sub.ingredient_name,
            quantity: sub.quantity,
            unit: sub.unit || sub.ingredient_unit,
            cost_per_unit: subCalc.effective_cost_per_unit,
            item_cost: Number(subCalc.item_cost.toFixed(4))
          };
        });

        const subYield = Math.max(0.0001, parseFloat(subProd?.portion_count) || parseFloat(subProd?.recipe_yield) || 1);
        const subUnitCost = Number((subBatchCost / subYield).toFixed(4));
        if (subUnitCost > 0) {
          activeCostPerUnit = subUnitCost;
        }

        subRecipeData = {
          name: subProd?.recipe_name || item.ingredient_name,
          yield: subYield,
          unit_cost: subUnitCost,
          items: formattedSubItems
        };
      }

      const { effective_cost_per_unit, item_cost } = calculateRecipeItemCost(
        item.quantity,
        item.unit || item.ingredient_unit,
        item.ingredient_unit,
        activeCostPerUnit
      );
      calculatedCost += item_cost;

      formattedItems.push({
        ...item,
        cost_per_unit: effective_cost_per_unit,
        item_cost: Math.round(item_cost * 10000) / 10000,
        sub_recipe: subRecipeData
      });
    }

    const yieldQty = Math.max(0.0001, parseFloat(product.recipe_yield) || 1);
    const portionQty = Math.max(0.0001, parseFloat(product.portion_count) || yieldQty);
    const batchCost = Number(calculatedCost.toFixed(4));
    const unitCost = Number((calculatedCost / portionQty).toFixed(4));

    res.json({
      success: true,
      data: {
        product: {
          ...product,
          recipe_yield: yieldQty,
          portion_count: portionQty,
          portion_unit: product.portion_unit || 'แก้ว',
          yield_unit: product.yield_unit || 'L',
          recipe_name: product.recipe_name || '',
          shelf_life_days: product.shelf_life_days != null ? parseInt(product.shelf_life_days, 10) : null
        },
        recipe: formattedItems,
        calculated_cost: batchCost,
        unit_cost: unitCost,
        margin: product.selling_price > 0 ? Math.round(((product.selling_price - unitCost) / product.selling_price) * 10000) / 100 : 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST / PUT recipe for a product (Admin/Manager)
router.post("/product/:productId", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { items, recipe_name, recipe_yield, portion_count, portion_unit, shelf_life_days, update_product_cost = false, target_product_ids = [], deduct_recipe_on_sale, yield_unit } = req.body;
    const productId = req.params.productId;
    await ensureRecipeDeductionColumns().catch(() => {});

    const product = await db.get(
      "SELECT id, name FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [productId, req.store_id]
    );

    if (!product) return next(new AppError("ไม่พบข้อมูลสินค้า", 404));

    if (!Array.isArray(items)) {
      return next(new AppError("ข้อมูลรายการสูตรไม่ถูกต้อง", 400));
    }

    const yieldQty = Math.max(0.0001, parseFloat(recipe_yield) || 1);
    const portionQty = Math.max(0.0001, parseFloat(portion_count) || yieldQty);
    const portUnit = portion_unit !== undefined ? String(portion_unit).trim() : 'แก้ว';
    const recName = recipe_name !== undefined ? String(recipe_name).trim() : null;
    const shelfLifeDays = (shelf_life_days !== undefined && shelf_life_days !== null && shelf_life_days !== '')
      ? Math.max(0, parseInt(shelf_life_days, 10) || 0)
      : null;
    // Opt-in Recipe Deduction flag: applied to main + mapped products only when explicitly sent
    const deductFlag = deduct_recipe_on_sale === undefined || deduct_recipe_on_sale === null
      ? null
      : (deduct_recipe_on_sale === 1 || deduct_recipe_on_sale === true || deduct_recipe_on_sale === '1' ? 1 : 0);
    // Batch-yield unit: persisted so the editor selection survives refresh
    const yieldUnitVal = yield_unit !== undefined && yield_unit !== null ? String(yield_unit).trim() || null : null;

    // Build unique product IDs list to update (excluding any IDs that are ingredients in items to prevent recursive wipeout)
    const itemIngredientIds = new Set(items.map(i => i.ingredient_id).filter(Boolean));
    const safeTargetProductIds = (target_product_ids || []).filter(id => id && id !== productId && !itemIngredientIds.has(id));
    const requestedProductIds = Array.from(new Set([productId, ...safeTargetProductIds]));
    const existingProducts = requestedProductIds.length > 0 
      ? await db.all(`SELECT id FROM products WHERE id IN (${requestedProductIds.map(() => '?').join(',')})`, requestedProductIds)
      : [];
    const existingProductIds = new Set(existingProducts.map(p => p.id));
    const productIdsToUpdate = requestedProductIds.filter(id => existingProductIds.has(id));

    let calculatedCost = 0;

    for (const pid of productIdsToUpdate) {
      // Update recipe_name, recipe_yield, portion_count, portion_unit, yield_unit, unit in products table
      if (deductFlag !== null) {
        await db.run(
          "UPDATE products SET recipe_name = ?, recipe_yield = ?, portion_count = ?, portion_unit = ?, shelf_life_days = ?, deduct_recipe_on_sale = ?, yield_unit = COALESCE(?, yield_unit, 'L'), unit = COALESCE(NULLIF(?, ''), unit), updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [recName, yieldQty, portionQty, portUnit, shelfLifeDays, deductFlag, yieldUnitVal, portUnit, pid]
        );
      } else {
        await db.run(
          "UPDATE products SET recipe_name = ?, recipe_yield = ?, portion_count = ?, portion_unit = ?, shelf_life_days = ?, yield_unit = COALESCE(?, yield_unit, 'L'), unit = COALESCE(NULLIF(?, ''), unit), updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [recName, yieldQty, portionQty, portUnit, shelfLifeDays, yieldUnitVal, portUnit, pid]
        );
      }

      // Delete existing recipe items for this product
      await db.run("DELETE FROM recipes WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')", [pid, req.store_id]);

      let currentProductCost = 0;

      for (const item of items) {
        if (!item.ingredient_id || !item.quantity || item.quantity <= 0) continue;
        if (item.ingredient_id === pid) continue; // Safety guard: A product cannot have itself as an ingredient

        let ingredient = await db.get(
          "SELECT id, cost_per_unit, unit FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [item.ingredient_id, req.store_id]
        );

        if (!ingredient) {
          const prod = await db.get(
            "SELECT id, sku, name, cost_price, unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
            [item.ingredient_id, req.store_id]
          ) || await db.get(
            "SELECT id, sku, name, cost_price, unit FROM products WHERE id = ?",
            [item.ingredient_id]
          );
          if (prod) {
            const ingUnit = prod.unit || item.unit || 'ชิ้น';
            const ingCost = parseFloat(prod.cost_price) || 0;
            ingredient = { id: prod.id, cost_per_unit: ingCost, unit: ingUnit };
          }
        }

        if (!ingredient) continue;

        const recipeId = uuidv4();
        const unit = item.unit || ingredient.unit || 'ชิ้น';
        const qty = parseFloat(item.quantity);

        await db.run(
          `INSERT INTO recipes (id, product_id, ingredient_id, quantity, unit, store_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [recipeId, pid, item.ingredient_id, qty, unit, req.store_id]
        );

        const { item_cost } = calculateRecipeItemCost(qty, unit, ingredient.unit, ingredient.cost_per_unit);
        currentProductCost += item_cost;
      }

      if (pid === productId) {
        calculatedCost = currentProductCost;
      }
    }

    const batchCost = Number(calculatedCost.toFixed(4));
    const unitCost = Number((calculatedCost / portionQty).toFixed(4));

    // Always update cost_price directly with unitCost for main product & target mapped products
    for (const pid of productIdsToUpdate) {
      await db.run(
        "UPDATE products SET cost_price = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [unitCost, pid]
      );
      await db.run(
        "UPDATE ingredients SET cost_per_unit = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [unitCost, pid]
      );
    }

    res.json({
      success: true,
      message: target_product_ids.length > 0 
        ? `บันทึกสูตรและผูกกับสินค้าสำเร็จรูป ${productIdsToUpdate.length} รายการเรียบร้อยแล้ว`
        : "บันทึกสูตรสินค้าเรียบร้อยแล้ว",
      data: {
        product_id: productId,
        calculated_cost: batchCost,
        unit_cost: unitCost,
        recipe_yield: yieldQty,
        portion_count: portionQty,
        portion_unit: portUnit,
        recipe_name: recName,
        deduct_recipe_on_sale: deductFlag,
        yield_unit: yieldUnitVal,
        mapped_count: productIdsToUpdate.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET summary of all products recipe costs (excluding raw materials)
router.get("/summary", authenticate, async (req, res, next) => {
  try {
    await ensureRecipeDeductionColumns().catch(() => {});
    const currentStore = req.store_id || 'store-1';
    const products = await db.all(
      `SELECT p.id, p.name, p.sku, p.selling_price, p.cost_price, p.recipe_name, p.recipe_yield, p.portion_count, p.portion_unit, p.is_raw_material, p.deduct_recipe_on_sale, p.yield_unit, c.name as category_name,
              (SELECT ar.id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || p.id || '"%' OR ar.document_id = p.id) LIMIT 1) as pending_adjust_id,
              (SELECT ar.document_id FROM approval_requests ar WHERE ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || p.id || '"%' OR ar.document_id = p.id) LIMIT 1) as pending_adjust_doc,
              (SELECT ar.id FROM recipes r 
               JOIN approval_requests ar ON ar.document_type = 'stock_adjust' AND ar.store_id = ? AND ar.status = 'PENDING' AND (ar.payload LIKE '%"' || r.ingredient_id || '"%' OR ar.document_id = r.ingredient_id)
               WHERE r.product_id = p.id LIMIT 1) as recipe_pending_adjust_id
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 
         AND (
           (p.is_raw_material = 0 OR p.is_raw_material IS NULL)
           OR p.sku LIKE 'REC%'
           OR (p.recipe_name IS NOT NULL AND p.recipe_name != '')
           OR EXISTS (SELECT 1 FROM recipes r WHERE r.product_id = p.id)
         )
         AND (p.store_id = ? OR p.store_id IS NULL OR p.store_id = '')
       ORDER BY p.name ASC`,
      [currentStore, currentStore, currentStore, currentStore]
    );

    const recipeRows = await db.all(
      `SELECT r.product_id, r.quantity, r.unit as recipe_unit,
              COALESCE(i.unit, p.unit, 'ชิ้น') as ing_unit,
              COALESCE(i.cost_per_unit, p.cost_price, 0) as cost_per_unit
       FROM recipes r
       LEFT JOIN ingredients i ON r.ingredient_id = i.id
       LEFT JOIN products p ON r.ingredient_id = p.id
       WHERE (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
      [currentStore]
    );

    const summaryMap = {};

    for (const p of products) {
      summaryMap[p.id] = {
        product_id: p.id,
        product_name: p.name,
        recipe_name: p.recipe_name || '',
        recipe_yield: parseFloat(p.recipe_yield) || 1,
        portion_count: parseFloat(p.portion_count) || parseFloat(p.recipe_yield) || 1,
        portion_unit: p.portion_unit || 'แก้ว',
        is_raw_material: p.is_raw_material,
        deduct_recipe_on_sale: p.deduct_recipe_on_sale === 1 ? 1 : 0,
        yield_unit: p.yield_unit || null,
        sku: p.sku,
        category_name: p.category_name,
        selling_price: p.selling_price,
        current_cost: p.cost_price,
        calculated_cost: 0,
        ingredient_count: 0,
        pending_adjust_id: p.pending_adjust_id,
        pending_adjust_doc: p.pending_adjust_doc,
        recipe_pending_adjust_id: p.recipe_pending_adjust_id,
        is_locked: Boolean(p.pending_adjust_id || p.recipe_pending_adjust_id)
      };
    }

    for (const r of recipeRows) {
      if (summaryMap[r.product_id]) {
        const { item_cost } = calculateRecipeItemCost(r.quantity, r.recipe_unit, r.ing_unit, r.cost_per_unit);
        summaryMap[r.product_id].calculated_cost += item_cost;
        summaryMap[r.product_id].ingredient_count += 1;
      }
    }

    const result = Object.values(summaryMap).map((p) => {
      const batchCost = Number(p.calculated_cost.toFixed(4));
      const portionQty = p.portion_count > 0 ? p.portion_count : (p.recipe_yield > 0 ? p.recipe_yield : 1);
      const unitCost = Number((batchCost / portionQty).toFixed(4));
      return {
        ...p,
        calculated_cost: batchCost,
        unit_cost: unitCost,
        margin: p.selling_price > 0 ? Math.round(((p.selling_price - unitCost) / p.selling_price) * 10000) / 100 : 0
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST create a new Master Recipe
router.post("/master", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { name, category, recipe_yield = 1, yield_unit = 'g', portion_count, portion_unit, selling_price = 0, description = '', items = [], target_product_ids = [], is_raw_material = 0, deduct_recipe_on_sale = 0 } = req.body;
    if (!name || !name.trim()) {
      return next(new AppError("กรุณาระบุชื่อสูตรอาหาร", 400));
    }
    await ensureRecipeDeductionColumns().catch(() => {});
    const deductFlag = (deduct_recipe_on_sale === 1 || deduct_recipe_on_sale === true || deduct_recipe_on_sale === '1') ? 1 : 0;

    const productId = uuidv4();
    const sku = 'REC' + String(Math.floor(100000 + Math.random() * 900000));
    const effectiveYield = Math.max(0.0001, parseFloat(portion_count) || parseFloat(recipe_yield) || 1);
    const finalSellingPrice = parseFloat(selling_price) || 0;
    const finalUnit = portion_unit || yield_unit || 'ถุง';
    const rawFlag = (is_raw_material === 1 || is_raw_material === true) ? 1 : 0;

    let targetCatId = null;
    if (category) {
      const catMatch = await db.get("SELECT id FROM categories WHERE (id = ? OR name = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '') LIMIT 1", [category, category, req.store_id]);
      if (catMatch) targetCatId = catMatch.id;
    }
    if (!targetCatId) {
      if (rawFlag === 1) {
        const rawCat = await db.get("SELECT id FROM categories WHERE (name = 'วัตถุดิบ' OR name LIKE '%วัตถุดิบ%' OR is_raw_material = 1) AND (store_id = ? OR store_id IS NULL OR store_id = '') LIMIT 1", [req.store_id]);
        if (rawCat) targetCatId = rawCat.id;
      } else {
        const nonRawCat = await db.get("SELECT id FROM categories WHERE (name != 'วัตถุดิบ' AND name NOT LIKE '%วัตถุดิบ%' AND (is_raw_material = 0 OR is_raw_material IS NULL)) AND (store_id = ? OR store_id IS NULL OR store_id = '') AND is_active = 1 ORDER BY sort_order, name LIMIT 1", [req.store_id]);
        if (nonRawCat) targetCatId = nonRawCat.id;
      }
    }

    await db.run(
      `INSERT INTO products (id, sku, name, description, category_id, cost_price, selling_price, recipe_name, recipe_yield, unit, is_raw_material, is_active, store_id, deduct_recipe_on_sale, yield_unit)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [productId, sku, name.trim(), description, targetCatId, finalSellingPrice, name.trim(), effectiveYield, finalUnit, rawFlag, req.store_id, deductFlag, yield_unit || null]
    );

    await db.run(
      `INSERT OR IGNORE INTO inventory (product_id, store_id, quantity, reorder_level)
       VALUES (?, ?, 0, 5)`,
      [productId, req.store_id]
    );

    let calculatedCost = 0;
    for (const item of items) {
      if (!item.ingredient_id || !item.quantity || item.quantity <= 0) continue;

      let ingredient = await db.get(
        "SELECT id, cost_per_unit, unit FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [item.ingredient_id, req.store_id]
      );
      if (!ingredient) {
        const prod = await db.get(
          "SELECT id, sku, name, cost_price, unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [item.ingredient_id, req.store_id]
        ) || await db.get(
          "SELECT id, sku, name, cost_price, unit FROM products WHERE id = ?",
          [item.ingredient_id]
        );
        if (prod) {
          const ingUnit = prod.unit || item.unit || 'ชิ้น';
          const ingCost = parseFloat(prod.cost_price) || 0;
          await db.run(
            `INSERT OR IGNORE INTO ingredients (id, sku, name, unit, cost_per_unit, quantity, reorder_level, store_id)
             VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
            [prod.id, prod.sku || null, prod.name || 'วัตถุดิบ/สินค้า', ingUnit, ingCost, req.store_id]
          );
          ingredient = { id: prod.id, cost_per_unit: ingCost, unit: ingUnit };
        }
      }

      if (!ingredient) continue;

      const recipeId = uuidv4();
      const rUnit = item.unit || ingredient.unit || 'ชิ้น';
      const qty = parseFloat(item.quantity);

      await db.run(
        `INSERT INTO recipes (id, product_id, ingredient_id, quantity, unit, store_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [recipeId, productId, item.ingredient_id, qty, rUnit, req.store_id]
      );

      const { item_cost } = calculateRecipeItemCost(qty, rUnit, ingredient.unit, ingredient.cost_per_unit);
      calculatedCost += item_cost;
    }

    const unitCost = Number((calculatedCost / effectiveYield).toFixed(4));

    await db.run(
      "UPDATE products SET cost_price = ? WHERE id = ?",
      [unitCost, productId]
    );

    // Apply recipe to target mapped products if specified
    if (Array.isArray(target_product_ids) && target_product_ids.length > 0) {
      for (const targetId of target_product_ids) {
        if (!targetId || targetId === productId) continue;
        const exists = await db.get("SELECT id FROM products WHERE id = ?", [targetId]);
        if (!exists) continue;

        await db.run(
          "UPDATE products SET recipe_name = ?, recipe_yield = ?, cost_price = ?, deduct_recipe_on_sale = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [name.trim(), effectiveYield, unitCost, deductFlag, targetId]
        );
        await db.run("DELETE FROM recipes WHERE product_id = ?", [targetId]);

        for (const item of items) {
          if (!item.ingredient_id || !item.quantity || item.quantity <= 0) continue;
          await db.run(
            `INSERT INTO recipes (id, product_id, ingredient_id, quantity, unit, store_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), targetId, item.ingredient_id, parseFloat(item.quantity), item.unit || 'g', req.store_id]
          );
        }
      }
    }

    res.json({
      success: true,
      message: `สร้างสูตรอาหาร "${name}" เรียบร้อยแล้ว`,
      data: { id: productId, name, recipe_name: name, recipe_yield: effectiveYield, unit_cost: unitCost, deduct_recipe_on_sale: deductFlag }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE master recipe
router.delete("/master/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if ingredient is used in other active recipes before deleting
    const otherRecipeUsage = await db.get(
      "SELECT COUNT(*) as count FROM recipes WHERE ingredient_id = ? AND product_id != ?",
      [id, id]
    );

    if (otherRecipeUsage && otherRecipeUsage.count > 0) {
      // Only delete recipe mapping for this product
      await db.run("DELETE FROM recipes WHERE product_id = ?", [id]);
      return res.json({ success: true, message: "ลบสูตรอาหารเรียบร้อยแล้ว (คงวัตถุดิบไว้เนื่องจากถูกใช้งานในสูตรอื่น)" });
    }

    await db.run("DELETE FROM recipes WHERE product_id = ? OR ingredient_id = ?", [id, id]);
    res.json({ success: true, message: "ลบสูตรอาหารสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// POST /produce - Batch Production Execution (Cut ingredients & add finished goods stock)
router.post("/produce", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { product_id, batch_count = 1, remark } = req.body;
    const currentStore = req.store_id || 'store-1';
    const count = Math.max(0.01, parseFloat(batch_count) || 1);

    if (!product_id) {
      return next(new AppError("กรุณาระบุสินค้า/สูตรอาหารที่ต้องการผลิต", 400));
    }

    const product = await db.get(
      "SELECT id, name, unit, recipe_name, recipe_yield, portion_count, portion_unit, shelf_life_days FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [product_id, currentStore]
    );

    if (!product) {
      return next(new AppError("ไม่พบข้อมูลสูตรอาหารที่ต้องการผลิต", 404));
    }

    // Check if the finished product itself has pending stock adjust approval
    const prodPending = await db.get(
      "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
      [currentStore, `%"product_id":"${product_id}"%`, product_id]
    );
    if (prodPending) {
      return next(new AppError(`สินค้า "${product.name}" มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${prodPending.document_id}) ไม่สามารถสร้างใบสั่งผลิต (WO) ได้จนกว่าจะได้รับอนุมัติ`, 400));
    }

    // Get recipe items
    const recipeItems = await db.all(
      `SELECT r.id, r.product_id, r.ingredient_id, r.quantity, r.unit,
              COALESCE(i.name, p.name) as ingredient_name,
              COALESCE(i.unit, p.unit, 'ชิ้น') as ingredient_unit,
              COALESCE(i.quantity, 0) as current_stock
       FROM recipes r
       LEFT JOIN ingredients i ON r.ingredient_id = i.id
       LEFT JOIN products p ON r.ingredient_id = p.id
       WHERE r.product_id = ? AND (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
      [product_id, currentStore]
    );

    if (!recipeItems || recipeItems.length === 0) {
      return next(new AppError(`สูตรอาหาร "${product.recipe_name || product.name}" ยังไม่มีส่วนผสมในระบบ`, 400));
    }

    // Check if any recipe ingredient has pending stock adjust approval
    for (const item of recipeItems) {
      const ingPending = await db.get(
        "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
        [currentStore, `%"product_id":"${item.ingredient_id}"%`, item.ingredient_id]
      );
      if (ingPending) {
        return next(new AppError(`วัตถุดิบ "${item.ingredient_name || item.ingredient_id}" ในสูตรการผลิต มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${ingPending.document_id}) ไม่สามารถสร้างใบสั่งผลิต (WO) ได้จนกว่าจะได้รับอนุมัติ`, 400));
      }
    }

    // Calculate required quantities and perform strict stock validation
    const ingredientRequirements = [];
    const deficitIngredients = [];

    for (const item of recipeItems) {
      const requiredQtyPerBatch = parseFloat(item.quantity) || 0;
      const totalRequiredQtyInRecipeUnit = Number((requiredQtyPerBatch * count).toFixed(4));
      const recipeUnit = item.unit || 'g';
      
      // Fetch current ingredient stock
      const ingStock = await db.get(
        "SELECT id, name, unit, quantity FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [item.ingredient_id, currentStore]
      );

      const ingredientBaseUnit = ingStock?.unit || item.ingredient_unit || recipeUnit;
      const currentStockInIngUnit = ingStock ? (parseFloat(ingStock.quantity) || 0) : (parseFloat(item.current_stock) || 0);
      const ingredientName = item.ingredient_name || ingStock?.name || 'วัตถุดิบ';

      // Convert current ingredient stock into recipe unit for accurate comparison
      const currentStockInRecipeUnit = Number(convertQuantity(currentStockInIngUnit, ingredientBaseUnit, recipeUnit).toFixed(4));

      if (currentStockInRecipeUnit < totalRequiredQtyInRecipeUnit) {
        const missingInRecipeUnit = Number((totalRequiredQtyInRecipeUnit - currentStockInRecipeUnit).toFixed(4));
        deficitIngredients.push({
          name: ingredientName,
          required: totalRequiredQtyInRecipeUnit,
          stock: currentStockInRecipeUnit,
          unit: recipeUnit,
          missing: missingInRecipeUnit
        });
      }

      // Convert required quantity into ingredient base unit for DB deduction
      const requiredQtyInIngUnit = Number(convertQuantity(totalRequiredQtyInRecipeUnit, recipeUnit, ingredientBaseUnit).toFixed(4));
      const newStockInIngUnit = Number((currentStockInIngUnit - requiredQtyInIngUnit).toFixed(4));

      ingredientRequirements.push({
        ingredient_id: item.ingredient_id,
        name: ingredientName,
        recipe_unit: recipeUnit,
        ingredient_unit: ingredientBaseUnit,
        required_qty_recipe_unit: totalRequiredQtyInRecipeUnit,
        required_qty_ing_unit: requiredQtyInIngUnit,
        current_stock_ing_unit: currentStockInIngUnit,
        new_stock_ing_unit: newStockInIngUnit
      });
    }

    // STRICT BLOCKING CHECK: If any raw material is insufficient, reject production!
    if (deficitIngredients.length > 0) {
      const deficitMsg = deficitIngredients
        .map(d => `"${d.name}" (ต้องการ ${d.required} ${d.unit} แต่มีเพียง ${d.stock} ${d.unit})`)
        .join(", ");
      return next(new AppError(`ไม่สามารถยืนยันการผลิตได้ เนื่องจากวัตถุดิบไม่เพียงพอ: ${deficitMsg}`, 400));
    }

    // Generate Work Order Number (e.g. WO-20260908-4921)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
    const woNumber = `WO-${dateStr}-${randomSeq}`;
    const woId = uuidv4();

    // Perform atomic stock updates
    // 1. Deduct raw ingredient stock & record transaction in both ingredient_stock_transactions and stock_transactions
    for (const ing of ingredientRequirements) {
      await db.run(
        "UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [ing.new_stock_ing_unit, ing.ingredient_id]
      );

      await db.run(
        "UPDATE inventory SET quantity = ? WHERE product_id = ?",
        [ing.new_stock_ing_unit, ing.ingredient_id]
      );

      // If this ingredient is itself a batch-tracked finished good (sub-recipe / prep item
      // consumed as an ingredient), FIFO-deduct from its production batches too.
      await batchService.deductFromBatches(ing.ingredient_id, currentStore, ing.required_qty_ing_unit);

      const txId = uuidv4();
      const deductionRemark = remark || `ตัดวัตถุดิบจากการผลิตสูตร ${product.recipe_name || product.name} (${count} Batch = -${ing.required_qty_ing_unit} ${ing.ingredient_unit})`;

      await db.run(
        `INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark, gr_number, gi_number, created_at)
         VALUES (?, ?, ?, ?, 'issue', ?, ?, ?, ?, datetime('now', '+7 hours'))`,
        [
          txId, 
          ing.ingredient_id, 
          req.user?.id || 'system', 
          currentStore, 
          -ing.required_qty_ing_unit, 
          deductionRemark,
          woNumber,
          woNumber
        ]
      );

      await db.run(
        `INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, gr_number, gi_number, created_at)
         VALUES (?, ?, ?, ?, 'issue', ?, ?, ?, ?, datetime('now', '+7 hours'))`,
        [
          txId,
          ing.ingredient_id,
          req.user?.id || 'system',
          currentStore,
          -ing.required_qty_ing_unit,
          deductionRemark,
          woNumber,
          woNumber
        ]
      );
    }

    // 2. Add finished product stock yield & record transaction
    const portionCountPerBatch = parseFloat(product.portion_count) || parseFloat(product.recipe_yield) || 1;
    const totalProducedYield = Number((portionCountPerBatch * count).toFixed(4));
    const yieldUnit = product.portion_unit || product.unit || 'หน่วย';

    // Check existing finished product inventory
    const existingInventory = await db.get(
      "SELECT quantity FROM inventory WHERE product_id = ?",
      [product_id]
    );

    const currentProdStock = existingInventory ? (parseFloat(existingInventory.quantity) || 0) : 0;
    const newProdStock = Number((currentProdStock + totalProducedYield).toFixed(4));

    await db.run(
      `INSERT INTO inventory (product_id, store_id, quantity, reorder_level)
       VALUES (?, ?, ?, 5)
       ON CONFLICT(product_id) DO UPDATE SET quantity = ?, updated_at = datetime('now', '+7 hours')`,
      [product_id, currentStore, newProdStock, newProdStock]
    );

    // Record a batch (with computed expiry date, if the product has shelf_life_days configured)
    // so this production run's stock can be FIFO-tracked and auto-removed after expiry.
    const batchInfo = await batchService.createBatch({
      productId: product_id,
      storeId: currentStore,
      woId,
      woNumber,
      qty: totalProducedYield,
      unit: yieldUnit
    });

    // If product is also synced as a prep item in ingredients table, update ingredients.quantity too
    const syncedPrepIngredient = await db.get(
      "SELECT id FROM ingredients WHERE id = ?",
      [product_id]
    );
    if (syncedPrepIngredient) {
      await db.run(
        "UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [newProdStock, product_id]
      );
    }

    // Calculate total cost of production & prepare WO item records
    let totalWOCost = 0;
    for (const reqItem of ingredientRequirements) {
      const ingCostRow = await db.get(
        "SELECT cost_per_unit, unit FROM ingredients WHERE id = ? UNION SELECT cost_price as cost_per_unit, unit FROM products WHERE id = ?",
        [reqItem.ingredient_id, reqItem.ingredient_id]
      );
      const ingCostPerUnit = parseFloat(ingCostRow?.cost_per_unit) || 0;
      const { item_cost } = calculateRecipeItemCost(reqItem.required_qty_recipe_unit, reqItem.recipe_unit, ingCostRow?.unit || reqItem.ingredient_unit, ingCostPerUnit);
      reqItem.item_cost = Number(item_cost.toFixed(4));
      totalWOCost += item_cost;
    }
    totalWOCost = Number(totalWOCost.toFixed(4));

    // Save Work Order Master Record
    await db.run(
      `INSERT INTO work_orders (id, store_id, wo_number, product_id, product_name, batch_count, produced_yield, yield_unit, total_cost, user_id, user_name, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))`,
      [
        woId,
        currentStore,
        woNumber,
        product_id,
        product.recipe_name || product.name,
        count,
        totalProducedYield,
        yieldUnit,
        totalWOCost,
        req.user?.id || 'system',
        req.user?.full_name || req.user?.username || 'ผู้ใช้งาน',
        remark || `ผลิต ${count} Batch (${product.recipe_name || product.name})`
      ]
    );

    // Save Work Order Items
    for (const reqItem of ingredientRequirements) {
      await db.run(
        `INSERT INTO work_order_items (id, wo_id, ingredient_id, ingredient_name, quantity, unit, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          woId,
          reqItem.ingredient_id,
          reqItem.name,
          reqItem.required_qty_recipe_unit,
          reqItem.recipe_unit,
          reqItem.item_cost || 0
        ]
      );
    }

    // Record stock transaction for finished product yield
    await db.run(
      `INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark, gr_number, created_at)
       VALUES (?, ?, ?, ?, 'receive', ?, ?, ?, datetime('now', '+7 hours'))`,
      [
        uuidv4(),
        product_id,
        req.user?.id || 'system',
        currentStore,
        totalProducedYield,
        remark || `รับเข้าสินค้าจากการผลิตสูตร ${product.recipe_name || product.name} (${count} Batch = +${totalProducedYield} ${yieldUnit})`,
        woNumber
      ]
    );

    res.json({
      success: true,
      message: `ผลิตสูตร "${product.recipe_name || product.name}" สำเร็จ (${woNumber}) - ตัดวัตถุดิบ ${ingredientRequirements.length} รายการ และรับเข้าสต็อก +${totalProducedYield} ${yieldUnit}`,
      data: {
        wo_id: woId,
        wo_number: woNumber,
        product_id,
        product_name: product.name,
        batch_count: count,
        produced_yield: totalProducedYield,
        yield_unit: yieldUnit,
        total_cost: totalWOCost,
        new_product_stock: newProdStock,
        expiry_date: batchInfo?.expiry_date || null,
        shelf_life_days: batchInfo?.shelf_life_days ?? null,
        ingredients_deducted: ingredientRequirements
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /work-orders - List Work Orders with search and date filtering
router.get("/work-orders", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || 'store-1';
    const { search = '', limit = 100, startDate, endDate, start_date, end_date } = req.query;
    const effectiveStart = startDate || start_date;
    const effectiveEnd = endDate || end_date;

    let query = `SELECT wo.*, u.full_name as user_full_name,
                        ar.status as ar_status,
                        ar.created_at as ar_cancel_requested_at,
                        ar.requester_name as ar_cancel_requester_name,
                        ar.responded_at as ar_approved_at,
                        ar.approver_name as ar_approver_name
                 FROM work_orders wo
                 LEFT JOIN users u ON wo.user_id = u.id
                 LEFT JOIN (
                   SELECT document_id, store_id, MAX(created_at) as created_at, MAX(responded_at) as responded_at, MAX(approver_name) as approver_name, MAX(requester_name) as requester_name, MAX(status) as status
                   FROM approval_requests
                   GROUP BY document_id, store_id
                 ) ar ON (wo.wo_number = ar.document_id OR wo.id = ar.document_id) AND (wo.store_id = ar.store_id OR wo.store_id IS NULL OR wo.store_id = '')
                 WHERE (wo.store_id = ? OR wo.store_id IS NULL OR wo.store_id = '')`;
    const params = [currentStore];

    if (search && search.trim()) {
      query += ` AND (wo.wo_number LIKE ? OR wo.product_name LIKE ?)`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (effectiveStart) {
      query += ` AND DATE(wo.created_at) >= DATE(?)`;
      params.push(effectiveStart);
    }

    if (effectiveEnd) {
      query += ` AND DATE(wo.created_at) <= DATE(?)`;
      params.push(effectiveEnd);
    }

    query += ` ORDER BY wo.created_at DESC LIMIT ?`;
    params.push(parseInt(limit) || 100);

    const workOrders = await db.all(query, params);
    const processedWos = (workOrders || []).map(wo => {
      let currentStatus = wo.status;
      if ((currentStatus === 'รออนุมัติ' || currentStatus === 'pending_approval') && wo.ar_status === 'APPROVED') {
        currentStatus = 'cancelled';
        db.run(
          "UPDATE work_orders SET status = 'cancelled', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')) WHERE id = ?",
          [wo.ar_approver_name || 'ผู้จัดการ', wo.ar_approved_at, wo.id]
        ).catch(() => {});
      }
      return {
        ...wo,
        status: currentStatus,
        cancel_requested_at: wo.cancel_requested_at || wo.ar_cancel_requested_at || null,
        cancel_requester_name: wo.cancel_requester_name || wo.ar_cancel_requester_name || null,
        approved_at: wo.approved_at || wo.ar_approved_at || null,
        approver_name: wo.approver_name || wo.ar_approver_name || null
      };
    });
    res.json({ success: true, data: processedWos });
  } catch (err) {
    next(err);
  }
});

// GET /work-orders/:id - Get Work Order detail with itemized ingredients
router.get("/work-orders/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const wo = await db.get("SELECT * FROM work_orders WHERE id = ? OR wo_number = ?", [id, id]);
    if (!wo) {
      return next(new AppError("ไม่พบข้อมูล ใบสั่งผลิต (Work Order)", 404));
    }

    // Fallback cancel and approver info from approval_requests if not populated on wo
    const approval = await db.get(`
      SELECT status as approval_status, created_at as cancel_requested_at, responded_at as approval_responded_at, requester_name, approver_name
      FROM approval_requests
      WHERE (document_id = ? OR document_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')
      ORDER BY created_at DESC LIMIT 1
    `, [wo.wo_number, wo.id, wo.store_id || 'store-1']);

    if (approval) {
      if ((wo.status === 'รออนุมัติ' || wo.status === 'pending_approval') && approval.approval_status === 'APPROVED') {
        wo.status = 'cancelled';
        db.run(
          "UPDATE work_orders SET status = 'cancelled', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')) WHERE id = ?",
          [approval.approver_name || 'ผู้จัดการ', approval.approval_responded_at, wo.id]
        ).catch(() => {});
      }
      if (!wo.cancel_requested_at) wo.cancel_requested_at = approval.cancel_requested_at;
      if (!wo.cancel_requester_name) wo.cancel_requester_name = approval.requester_name;
      if (!wo.approved_at) wo.approved_at = approval.approval_responded_at;
      if (!wo.approver_name) wo.approver_name = approval.approver_name;
    }

    const items = await db.all("SELECT * FROM work_order_items WHERE wo_id = ?", [wo.id]);
    const batch = await db.get("SELECT expiry_date, produced_at, qty_remaining, status FROM product_batches WHERE wo_id = ?", [wo.id]);
    res.json({
      success: true,
      data: {
        ...wo,
        items,
        expiry_date: batch?.expiry_date || null,
        batch_status: batch?.status || null,
        qty_remaining: batch?.qty_remaining ?? null
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /work-orders/:id/cancel - Cancel Work Order (Rollback stock & return ingredients)
router.post("/work-orders/:id/cancel", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentStore = req.store_id || 'store-1';
    const { reason } = req.body || {};

    const wo = await db.get(
      "SELECT * FROM work_orders WHERE (id = ? OR wo_number = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [id, id, currentStore]
    );

    if (!wo) {
      return next(new AppError("ไม่พบข้อมูลใบสั่งผลิต (Work Order)", 404));
    }

    if (wo.status === 'cancelled') {
      return next(new AppError("ใบสั่งผลิตนี้ถูกยกเลิกไปแล้ว", 400));
    }

    if (wo.status === 'รออนุมัติ' || wo.status === 'pending_approval') {
      return next(new AppError("ใบสั่งผลิตนี้อยู่ระหว่างรอการอนุมัติผ่าน LINE", 400));
    }

    const lineRequired = await isLineApprovalRequired(currentStore);

    if (lineRequired) {
      // 1. Update WO status to 'รออนุมัติ'
      try { await db.run("ALTER TABLE work_orders ADD COLUMN status TEXT DEFAULT 'completed'"); } catch (_) {}
      try { await db.run("ALTER TABLE work_orders ADD COLUMN cancel_requested_at TEXT"); } catch (_) {}
      try { await db.run("ALTER TABLE work_orders ADD COLUMN cancel_requester_name TEXT"); } catch (_) {}

      const requesterName = req.user?.full_name || req.user?.username || 'Staff';
      await db.run(
        "UPDATE work_orders SET status = 'รออนุมัติ', remark = COALESCE(remark || ' | ', '') || ?, cancel_requested_at = datetime('now', '+7 hours'), cancel_requester_name = ? WHERE id = ?",
        [`[รออนุมัติยกเลิก: ${reason}]`, requesterName, wo.id]
      );

      let approval = await db.get(
        "SELECT * FROM approval_requests WHERE document_id = ? AND store_id = ? AND status = 'PENDING'",
        [wo.wo_number || wo.id, currentStore]
      );

      if (!approval) {
        const woItems = await db.all(`
          SELECT ingredient_name as name, quantity, unit, cost
          FROM work_order_items
          WHERE wo_id = ?
        `, [wo.id]);

        const approvalPayload = {
          items: woItems,
          wo_number: wo.wo_number,
          product_name: wo.product_name,
          batch_count: wo.batch_count,
          produced_yield: wo.produced_yield,
          yield_unit: wo.yield_unit,
          total_cost: wo.total_cost
        };

        approval = {
          id: uuidv4(),
          store_id: currentStore,
          document_type: 'wo_cancel',
          document_id: wo.wo_number || wo.id,
          amount: parseFloat(wo.total_cost) || parseFloat(wo.produced_yield) || 0,
          reason: reason || 'ขอยกเลิกใบสั่งผลิต (Work Order)',
          requester_id: req.user.id,
          requester_name: req.user.full_name || req.user.username || 'Staff',
          status: 'PENDING',
          payload: JSON.stringify(approvalPayload)
        };

        await db.run(`
          INSERT INTO approval_requests
          (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [
          approval.id,
          approval.store_id,
          approval.document_type,
          approval.document_id,
          approval.amount,
          approval.reason,
          approval.requester_id,
          approval.requester_name,
          approval.payload
        ]);

        try {
          await lineService.sendApprovalRequestNotification(approval);
        } catch (lineErr) {
          console.warn('[WO Cancel] Failed to push notification to LINE:', lineErr.message);
        }
      }

      return res.json({
        success: true,
        requires_approval: true,
        message: `ส่งคำขออนุมัติยกเลิกใบสั่งผลิต #${wo.wo_number} ไปยัง LINE เรียบร้อยแล้ว`,
        data: approval
      });
    }

    // Direct execution
    const result = await cancelWorkOrder({
      woId: wo.id,
      storeId: currentStore,
      requesterId: req.user?.id || 'system',
      approverName: req.user?.full_name || req.user?.username || 'Admin/Manager',
      reason
    });

    res.json({
      success: true,
      requires_approval: false,
      message: result.message || `ยกเลิกใบสั่งผลิต ${wo.wo_number} สำเร็จ`,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
