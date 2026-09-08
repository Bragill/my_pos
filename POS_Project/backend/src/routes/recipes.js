const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
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
    const product = await db.get(
      "SELECT id, name, sku, cost_price, selling_price, recipe_name, recipe_yield, portion_count, portion_unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [req.params.productId, req.store_id]
    );

    if (!product) return next(new AppError("ไม่พบข้อมูลสินค้า", 404));

    const recipeItems = await db.all(
      `SELECT r.id, r.product_id, r.ingredient_id, r.quantity, r.unit,
              COALESCE(i.name, p.name) as ingredient_name,
              COALESCE(i.unit, p.unit, 'ชิ้น') as ingredient_unit,
              COALESCE(i.cost_per_unit, p.cost_price, 0) as cost_per_unit,
              COALESCE(i.quantity, 0) as stock_quantity
       FROM recipes r
       LEFT JOIN ingredients i ON r.ingredient_id = i.id
       LEFT JOIN products p ON r.ingredient_id = p.id
       WHERE r.product_id = ? AND (r.store_id = ? OR r.store_id IS NULL OR r.store_id = '')`,
      [req.params.productId, req.store_id]
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
          recipe_name: product.recipe_name || ''
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
    const { items, recipe_name, recipe_yield, portion_count, portion_unit, update_product_cost = false, target_product_ids = [] } = req.body;
    const productId = req.params.productId;

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

    // Build unique product IDs list to update (including target_product_ids if mapped)
    const productIdsToUpdate = Array.from(new Set([productId, ...target_product_ids].filter(Boolean)));

    let calculatedCost = 0;

    for (const pid of productIdsToUpdate) {
      // Update recipe_name, recipe_yield, portion_count, portion_unit in products table
      await db.run(
        "UPDATE products SET recipe_name = ?, recipe_yield = ?, portion_count = ?, portion_unit = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [recName, yieldQty, portionQty, portUnit, pid]
      );

      // Delete existing recipe items for this product
      await db.run("DELETE FROM recipes WHERE product_id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')", [pid, req.store_id]);

      let currentProductCost = 0;

      for (const item of items) {
        if (!item.ingredient_id || !item.quantity || item.quantity <= 0) continue;

        let ingredient = await db.get(
          "SELECT id, cost_per_unit, unit FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [item.ingredient_id, req.store_id]
        );

        if (!ingredient) {
          const prod = await db.get(
            "SELECT id, cost_price as cost_per_unit, unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
            [item.ingredient_id, req.store_id]
          );
          if (prod) {
            ingredient = { id: prod.id, cost_per_unit: parseFloat(prod.cost_price) || 0, unit: prod.unit || 'ชิ้น' };
          }
        }

        if (!ingredient) continue;

        const recipeId = uuidv4();
        const unit = item.unit || ingredient.unit;
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

    // Optionally update cost_price directly with unitCost for main product & target mapped products
    if (update_product_cost || target_product_ids.length > 0) {
      for (const pid of productIdsToUpdate) {
        await db.run(
          "UPDATE products SET cost_price = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [unitCost, pid]
        );
      }
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
    const currentStore = req.store_id || 'store-1';
    const products = await db.all(
      `SELECT p.id, p.name, p.sku, p.selling_price, p.cost_price, p.recipe_name, p.recipe_yield, p.portion_count, p.portion_unit, p.is_raw_material, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 
         AND (p.is_raw_material = 0 OR p.is_raw_material IS NULL)
         AND (c.name IS NULL OR (c.name != 'วัตถุดิบ' AND c.name NOT LIKE '%วัตถุดิบ%'))
         AND (p.store_id = ? OR p.store_id IS NULL OR p.store_id = '')
       ORDER BY p.name ASC`,
      [currentStore]
    );

    const recipeRows = await db.all(
      `SELECT r.product_id, r.quantity, r.unit as recipe_unit, i.unit as ing_unit, i.cost_per_unit
       FROM recipes r
       JOIN ingredients i ON r.ingredient_id = i.id
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
        sku: p.sku,
        category_name: p.category_name,
        selling_price: p.selling_price,
        current_cost: p.cost_price,
        calculated_cost: 0,
        ingredient_count: 0
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
    const { name, category, recipe_yield = 1, yield_unit = 'g', portion_count, portion_unit, selling_price = 0, description = '', items = [], target_product_ids = [], is_raw_material = 0 } = req.body;
    if (!name || !name.trim()) {
      return next(new AppError("กรุณาระบุชื่อสูตรอาหาร", 400));
    }

    const productId = uuidv4();
    const sku = 'REC' + String(Math.floor(100000 + Math.random() * 900000));
    const effectiveYield = Math.max(0.0001, parseFloat(portion_count) || parseFloat(recipe_yield) || 1);
    const finalSellingPrice = parseFloat(selling_price) || 0;
    const finalUnit = portion_unit || yield_unit || 'ถุง';
    const rawFlag = (is_raw_material === 1 || is_raw_material === true) ? 1 : 0;

    await db.run(
      `INSERT INTO products (id, sku, name, description, cost_price, selling_price, recipe_name, recipe_yield, unit, is_raw_material, is_active, store_id)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ?)`,
      [productId, sku, name.trim(), description, finalSellingPrice, name.trim(), effectiveYield, finalUnit, rawFlag, req.store_id]
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
          "SELECT id, cost_price as cost_per_unit, unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [item.ingredient_id, req.store_id]
        );
        if (prod) {
          ingredient = { id: prod.id, cost_per_unit: parseFloat(prod.cost_price) || 0, unit: prod.unit || 'ชิ้น' };
        }
      }

      if (!ingredient) continue;

      const recipeId = uuidv4();
      const rUnit = item.unit || ingredient.unit;
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

        await db.run(
          "UPDATE products SET recipe_name = ?, recipe_yield = ?, cost_price = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [name.trim(), effectiveYield, unitCost, targetId]
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
      data: { id: productId, name, recipe_name: name, recipe_yield: effectiveYield, unit_cost: unitCost }
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
      "SELECT id, name, unit, recipe_name, recipe_yield, portion_count, portion_unit FROM products WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [product_id, currentStore]
    );

    if (!product) {
      return next(new AppError("ไม่พบข้อมูลสูตรอาหารที่ต้องการผลิต", 404));
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

    // Perform atomic stock updates
    // 1. Deduct raw ingredient stock & record transaction
    for (const ing of ingredientRequirements) {
      await db.run(
        "UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [ing.new_stock_ing_unit, ing.ingredient_id]
      );

      await db.run(
        "UPDATE inventory SET quantity = ? WHERE product_id = ?",
        [ing.new_stock_ing_unit, ing.ingredient_id]
      );

      await db.run(
        `INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark)
         VALUES (?, ?, ?, ?, 'production_issue', ?, ?)`,
        [
          uuidv4(), 
          ing.ingredient_id, 
          req.user?.id || 'system', 
          currentStore, 
          -ing.required_qty_ing_unit, 
          remark || `ตัดวัตถุดิบจากการผลิตสูตร ${product.recipe_name || product.name} (${count} Batch)`
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

    // Record stock transaction for finished product yield
    await db.run(
      `INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark)
       VALUES (?, ?, ?, ?, 'production_receive', ?, ?)`,
      [
        uuidv4(),
        product_id,
        req.user?.id || 'system',
        currentStore,
        totalProducedYield,
        remark || `รับเข้าสินค้าจากการผลิตสูตร ${product.recipe_name || product.name} (${count} Batch = +${totalProducedYield} ${yieldUnit})`
      ]
    );

    res.json({
      success: true,
      message: `ผลิตสูตร "${product.recipe_name || product.name}" สำเร็จ ${count} Batch (ตัดวัตถุดิบ ${ingredientRequirements.length} รายการ และเพิ่มสต็อกสินค้าขาย +${totalProducedYield} ${yieldUnit})`,
      data: {
        product_id,
        product_name: product.name,
        batch_count: count,
        produced_yield: totalProducedYield,
        yield_unit: yieldUnit,
        new_product_stock: newProdStock,
        ingredients_deducted: ingredientRequirements
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
