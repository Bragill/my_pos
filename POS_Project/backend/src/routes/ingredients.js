const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

function normalizeUnitKey(unitStr) {
  if (!unitStr) return 'g';
  const u = String(unitStr).trim();
  const lower = u.toLowerCase();
  if (['kg', 'กิโลกรัม', 'กก', 'ก.ก.', 'กิโล'].includes(lower)) return 'kg';
  if (['g', 'กรัม', 'ก.'].includes(lower)) return 'g';
  if (['ml', 'มิลลิลิตร', 'มล.', 'มล'].includes(lower)) return 'ml';
  if (['l', 'ลิตร'].includes(lower)) return 'L';
  if (['oz', 'ออนซ์'].includes(lower)) return 'oz';
  if (['ถุง', 'bag'].includes(lower)) return 'ถุง';
  if (['ขวด', 'bottle'].includes(lower)) return 'ขวด';
  if (['กล่อง', 'box'].includes(lower)) return 'กล่อง';
  if (['แพ็ค', 'pack'].includes(lower)) return 'แพ็ค';
  if (['แก้ว', 'cup'].includes(lower)) return 'แก้ว';
  if (['กระป๋อง', 'can'].includes(lower)) return 'กระป๋อง';
  if (['แผ่น', 'sheet'].includes(lower)) return 'แผ่น';
  if (['ชุด', 'set'].includes(lower)) return 'ชุด';
  if (['ชิ้น', 'pcs', 'piece'].includes(lower)) return 'ชิ้น';
  return u;
}

// Auto-sync products marked as raw material (is_raw_material = 1 or category 'วัตถุดิบ') into ingredients table
async function syncRawMaterialProductsToIngredients(storeId) {
  if (!storeId) return 0;
  try {
    const rawMaterialProducts = await db.all(
      `SELECT p.id, p.sku, p.name, p.unit, p.cost_price, COALESCE(i.quantity, 0) as stock_quantity, COALESCE(i.reorder_level, 5) as reorder_level
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory i ON p.id = i.product_id
       WHERE p.is_active = 1 
         AND (p.store_id = ? OR p.store_id IS NULL OR p.store_id = '')
         AND (p.is_raw_material = 1 OR c.is_raw_material = 1 OR c.name = 'วัตถุดิบ' OR c.name LIKE '%วัตถุดิบ%')`,
      [storeId]
    );

    let syncedCount = 0;
    for (const p of rawMaterialProducts) {
      const uKey = normalizeUnitKey(p.unit || 'g');
      const costPerUnit = parseFloat(p.cost_price) || 0;
      const qty = parseFloat(p.stock_quantity) || 0;
      const reorderLvl = parseFloat(p.reorder_level) || 5;

      const existing = await db.get(
        "SELECT id, cost_per_unit FROM ingredients WHERE (id = ? OR sku = ? OR name = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [p.id, p.sku, p.name, storeId]
      );

      const pCost = parseFloat(p.cost_price) || 0;
      const finalCostPerUnit = pCost > 0 ? pCost : (existing ? (existing.cost_per_unit || 0) : 0);

      if (existing) {
        await db.run(
          `UPDATE ingredients 
           SET sku = ?, name = ?, unit = ?, cost_per_unit = ?, quantity = ?, reorder_level = ?, store_id = ?, updated_at = datetime('now', '+7 hours')
           WHERE id = ?`,
          [p.sku, p.name, uKey, finalCostPerUnit, qty, reorderLvl, storeId, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO ingredients (id, sku, name, unit, cost_per_unit, quantity, reorder_level, store_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.sku, p.name, uKey, finalCostPerUnit, qty, reorderLvl, storeId]
        );
      }
      syncedCount++;
    }

    // 2-Way Sync: Sync any ingredients in ingredients table missing or inactive in products table
    let rawCategory = await db.get("SELECT id FROM categories WHERE (name = 'วัตถุดิบ' OR name LIKE '%วัตถุดิบ%') AND (store_id = ? OR store_id IS NULL OR store_id = '') AND is_active = 1 LIMIT 1", [storeId]);
    if (!rawCategory) {
      const catId = uuidv4();
      await db.run("INSERT INTO categories (id, name, is_raw_material, store_id) VALUES (?, 'วัตถุดิบ', 1, ?)", [catId, storeId]);
      rawCategory = { id: catId };
    }

    const allIngredients = await db.all(
      "SELECT * FROM ingredients WHERE store_id = ? OR store_id IS NULL OR store_id = ''",
      [storeId]
    );

    for (const ing of allIngredients) {
      const existingProd = await db.get(
        "SELECT id, is_active, is_raw_material FROM products WHERE (id = ? OR sku = ? OR name = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
        [ing.id, ing.sku, ing.name, storeId]
      );
      if (!existingProd) {
        await db.run(
          `INSERT INTO products (id, sku, name, category_id, store_id, cost_price, selling_price, is_raw_material, unit, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1)`,
          [ing.id, ing.sku, ing.name, rawCategory.id, storeId, ing.cost_per_unit || 0, ing.unit || 'g']
        );
        await db.run(
          `INSERT OR REPLACE INTO inventory (product_id, store_id, quantity, reorder_level) VALUES (?, ?, ?, ?)`,
          [ing.id, storeId, ing.quantity || 0, ing.reorder_level || 5]
        );
        syncedCount++;
      } else if (existingProd.is_active === 0 || existingProd.is_raw_material === 0) {
        await db.run(
          `UPDATE products SET is_active = 1, is_raw_material = 1, cost_price = ?, unit = ?, category_id = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?`,
          [ing.cost_per_unit || 0, ing.unit || 'g', rawCategory.id, existingProd.id]
        );
        syncedCount++;
      }
    }

    return syncedCount;
  } catch (err) {
    console.error("Error auto-syncing raw materials to ingredients:", err);
    return 0;
  }
}

// POST sync raw materials on-demand
router.post("/sync", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const currentStore = req.store_id || 'store-1';
    const syncedCount = await syncRawMaterialProductsToIngredients(currentStore);
    const ingredients = await db.all(
      "SELECT * FROM ingredients WHERE store_id = ? ORDER BY name ASC",
      [currentStore]
    );
    res.json({ success: true, message: `ซิงค์ข้อมูลวัตถุดิบสำเร็จ (${syncedCount} รายการ)`, data: ingredients });
  } catch (err) {
    next(err);
  }
});

// GET all ingredients for current store (with auto-sync)
router.get("/", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || 'store-1';
    await syncRawMaterialProductsToIngredients(currentStore);

    const { search } = req.query;
    let query = "SELECT * FROM ingredients WHERE store_id = ?";
    const params = [currentStore];

    if (search) {
      query += " AND (name LIKE ? OR sku LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY name ASC";
    const ingredients = await db.all(query, params);
    res.json({ success: true, data: ingredients });
  } catch (err) {
    next(err);
  }
});

// GET single ingredient with transaction history
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const ingredient = await db.get(
      "SELECT * FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = '')",
      [req.params.id, req.store_id]
    );

    if (!ingredient) return next(new AppError("ไม่พบข้อมูลวัตถุดิบ", 404));

    const transactions = await db.all(
      `SELECT t.*, u.full_name as user_name 
       FROM ingredient_stock_transactions t 
       LEFT JOIN users u ON t.user_id = u.id 
       WHERE t.ingredient_id = ? AND (t.store_id = ? OR t.store_id IS NULL OR t.store_id = 'store-1') 
       ORDER BY t.created_at DESC LIMIT 50`,
      [req.params.id, req.store_id]
    );

    ingredient.transactions = transactions;
    res.json({ success: true, data: ingredient });
  } catch (err) {
    next(err);
  }
});

// POST create new ingredient (Admin/Manager) with auto 2-way sync to products
router.post("/", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { sku, name, unit = "g", cost_per_unit = 0, quantity = 0, reorder_level = 0 } = req.body;

    if (!name || name.trim() === "") {
      return next(new AppError("กรุณาระบุชื่อวัตถุดิบ", 400));
    }

    const id = uuidv4();
    const finalSku = sku || `ING-${Date.now().toString().slice(-6)}`;
    const uKey = normalizeUnitKey(unit);
    const cost = parseFloat(cost_per_unit) || 0;
    const qty = parseFloat(quantity) || 0;
    const reorder = parseFloat(reorder_level) || 0;

    await db.run(
      `INSERT INTO ingredients (id, sku, name, unit, cost_per_unit, quantity, reorder_level, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, finalSku, name.trim(), uKey, cost, qty, reorder, req.store_id]
    );

    // Initial stock transaction log if quantity > 0
    if (qty > 0) {
      await db.run(
        `INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark)
         VALUES (?, ?, ?, ?, 'receive', ?, 'ยอดยกมา / Initial Stock')`,
        [uuidv4(), id, req.user.id, req.store_id, qty]
      );
    }

    // Auto-create/sync raw material product
    let rawCategory = await db.get("SELECT id FROM categories WHERE (name = 'วัตถุดิบ' OR name LIKE '%วัตถุดิบ%') AND is_active = 1 LIMIT 1");
    if (!rawCategory) {
      const catId = uuidv4();
      await db.run("INSERT INTO categories (id, name, is_raw_material, store_id) VALUES (?, 'วัตถุดิบ', 1, ?)", [catId, req.store_id]);
      rawCategory = { id: catId };
    }

    const existingProduct = await db.get("SELECT id FROM products WHERE id = ? OR sku = ?", [id, finalSku]);
    if (!existingProduct) {
      await db.run(
        `INSERT INTO products (id, sku, name, category_id, store_id, cost_price, selling_price, is_raw_material, unit, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1)`,
        [id, finalSku, name.trim(), rawCategory.id, req.store_id, cost, uKey]
      );
      await db.run(
        `INSERT OR REPLACE INTO inventory (product_id, store_id, quantity, reorder_level) VALUES (?, ?, ?, ?)`,
        [id, req.store_id, qty, reorder]
      );
    }

    const created = await db.get("SELECT * FROM ingredients WHERE id = ?", [id]);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

// PUT update ingredient (Admin/Manager)
router.put("/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { sku, name, unit, cost_per_unit, reorder_level } = req.body;
    const existing = await db.get(
      "SELECT * FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = 'store-1')",
      [req.params.id, req.store_id]
    );

    if (!existing) return next(new AppError("ไม่พบข้อมูลวัตถุดิบ", 404));

    const updatedUnit = unit !== undefined ? normalizeUnitKey(unit) : existing.unit;
    const updatedCost = cost_per_unit !== undefined ? parseFloat(cost_per_unit) : existing.cost_per_unit;
    const updatedReorder = reorder_level !== undefined ? parseFloat(reorder_level) : existing.reorder_level;
    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedSku = sku !== undefined ? sku : existing.sku;

    await db.run(
      `UPDATE ingredients 
       SET sku = ?, name = ?, unit = ?, cost_per_unit = ?, reorder_level = ?, updated_at = datetime('now', '+7 hours')
       WHERE id = ?`,
      [updatedSku, updatedName, updatedUnit, updatedCost, updatedReorder, req.params.id]
    );

    // Sync to product
    await db.run(
      `UPDATE products SET sku = ?, name = ?, unit = ?, cost_price = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?`,
      [updatedSku, updatedName, updatedUnit, updatedCost, req.params.id]
    );

    const updated = await db.get("SELECT * FROM ingredients WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST adjust stock for ingredient (Admin/Manager)
router.post("/:id/adjust", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { quantity_change, type = "adjust", remark } = req.body;
    const change = parseFloat(quantity_change);

    if (isNaN(change) || change === 0) {
      return next(new AppError("จำนวนที่ปรับเปลี่ยนไม่ถูกต้อง", 400));
    }

    const existing = await db.get(
      "SELECT * FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = 'store-1')",
      [req.params.id, req.store_id]
    );

    if (!existing) return next(new AppError("ไม่พบข้อมูลวัตถุดิบ", 404));

    const newQuantity = existing.quantity + change;

    await db.run(
      `UPDATE ingredients SET quantity = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?`,
      [newQuantity, req.params.id]
    );

    await db.run(
      `UPDATE inventory SET quantity = ? WHERE product_id = ?`,
      [newQuantity, req.params.id]
    );

    await db.run(
      `INSERT INTO ingredient_stock_transactions (id, ingredient_id, user_id, store_id, type, quantity, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, req.user.id, req.store_id, type, change, remark || "ปรับปรุงสต็อกวัตถุดิบ"]
    );

    const updated = await db.get("SELECT * FROM ingredients WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE ingredient (Admin/Manager)
router.delete("/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const existing = await db.get(
      "SELECT * FROM ingredients WHERE id = ? AND (store_id = ? OR store_id IS NULL OR store_id = 'store-1')",
      [req.params.id, req.store_id]
    );

    if (!existing) return next(new AppError("ไม่พบข้อมูลวัตถุดิบ", 404));

    const recipeUsage = await db.get(
      "SELECT COUNT(*) as count FROM recipes WHERE ingredient_id = ?",
      [req.params.id]
    );

    if (recipeUsage && recipeUsage.count > 0) {
      return next(new AppError("ไม่สามารถลบวัตถุดิบนี้ได้ เนื่องจากถูกใช้งานอยู่ในสูตรสินค้า", 400));
    }

    await db.run("DELETE FROM ingredient_stock_transactions WHERE ingredient_id = ?", [req.params.id]);
    await db.run("DELETE FROM ingredients WHERE id = ?", [req.params.id]);
    await db.run("UPDATE products SET is_active = 0 WHERE id = ?", [req.params.id]);

    res.json({ success: true, message: "ลบวัตถุดิบเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
