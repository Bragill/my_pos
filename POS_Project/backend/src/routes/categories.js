const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// Auto migration helper to ensure is_raw_material column exists
let migrationRan = false;
const ensureSchema = async () => {
  if (!migrationRan) {
    migrationRan = true;
    try { await db.run("ALTER TABLE categories ADD COLUMN is_raw_material INTEGER DEFAULT 0"); } catch (_) {}
  }
};

router.get("/", authenticate, async (req, res, next) => {
  try {
    await ensureSchema();
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const allRows = await db.all(
      `SELECT c.*, COUNT(p.id) as product_count 
       FROM categories c 
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 AND p.store_id = ?
       WHERE c.is_active=1 AND (c.store_id=? OR c.store_id IS NULL OR c.store_id='') 
       GROUP BY c.id 
       ORDER BY c.sort_order, c.name`,
      [currentStore, currentStore]
    );
    const storeSpecific = allRows.filter(c => c.store_id === currentStore);
    const shared = allRows.filter(c => c.store_id !== currentStore);
    const uniqueMap = new Map();
    for (const cat of storeSpecific) {
      if (cat.name) uniqueMap.set(cat.name.trim().toLowerCase(), cat);
    }
    for (const cat of shared) {
      if (cat.name) {
        const norm = cat.name.trim().toLowerCase();
        if (!uniqueMap.has(norm)) uniqueMap.set(norm, cat);
      }
    }
    const data = Array.from(uniqueMap.values()).map(c => ({
      ...c,
      is_raw_material: Boolean(c.is_raw_material || c.name === 'วัตถุดิบ' || (c.name && c.name.includes('วัตถุดิบ')))
    }));
    res.json({ success: true, data });
  } catch(e) { next(e); }
});

router.get("/:id/stock", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const cat = await db.get("SELECT * FROM categories WHERE id=?", [req.params.id]);
    if (!cat) return res.status(404).json({ success: false, message: "ไม่พบหมวดหมู่" });

    // Strict store isolation: category must either belong to current store or be a global template
    if (cat.store_id && cat.store_id !== currentStore) {
      return res.status(403).json({ success: false, message: "หมวดหมู่นี้ไม่ใช่ของสาขาปัจจุบัน" });
    }

    const rows = await db.all(
      `SELECT p.id, p.sku, p.barcode, p.name, p.unit, p.is_raw_material, p.cost_price, p.selling_price,
              COALESCE(i.quantity, 0) as quantity, COALESCE(i.reorder_level, 5) as reorder_level,
              COALESCE(c.name, ?) as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory i ON p.id = i.product_id AND i.store_id = p.store_id
       WHERE p.is_active = 1 
         AND p.store_id = ?
         AND (p.category_id = ? OR (c.name = ? AND c.name IS NOT NULL))
       ORDER BY p.name`,
      [cat.name, currentStore, req.params.id, cat.name]
    );

    res.json({
      success: true,
      category: {
        ...cat,
        is_raw_material: Boolean(cat.is_raw_material || cat.name === 'วัตถุดิบ' || cat.name.includes('วัตถุดิบ'))
      },
      data: rows
    });
  } catch(e) { next(e); }
});

router.post("/", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { name, description, sort_order, is_raw_material } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: { message: "กรุณาระบุชื่อหมวดหมู่" } });
    const id = uuidv4();
    const isRaw = Boolean(is_raw_material || name.trim() === 'วัตถุดิบ' || name.trim().includes('วัตถุดิบ')) ? 1 : 0;
    try {
      await db.run(
        "INSERT INTO categories (id,name,description,sort_order,store_id,is_active,is_raw_material) VALUES (?,?,?,?,?,1,?)",
        [id, name.trim(), description||null, sort_order||0, req.store_id, isRaw]
      );
    } catch {
      await db.run(
        "INSERT INTO categories (id,name,description,sort_order,store_id,is_active) VALUES (?,?,?,?,?,1)",
        [id, name.trim(), description||null, sort_order||0, req.store_id]
      );
    }
    const created = await db.get("SELECT * FROM categories WHERE id=?", [id]);
    res.status(201).json({ success: true, data: { ...created, is_raw_material: Boolean(created.is_raw_material || isRaw) } });
  } catch(e) { next(e); }
});

router.put("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { name, description, sort_order, is_active, is_raw_material } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: { message: "กรุณาระบุชื่อหมวดหมู่" } });
    const isRaw = Boolean(is_raw_material || name.trim() === 'วัตถุดิบ' || name.trim().includes('วัตถุดิบ')) ? 1 : 0;
    try {
      await db.run(
        "UPDATE categories SET name=?, description=?, sort_order=?, is_active=?, is_raw_material=?, updated_at=datetime('now', '+7 hours') WHERE id=?",
        [name.trim(), description||null, sort_order||0, is_active!==undefined ? (is_active ? 1 : 0) : 1, isRaw, req.params.id]
      );
    } catch {
      await db.run(
        "UPDATE categories SET name=?, description=?, sort_order=?, is_active=?, updated_at=datetime('now', '+7 hours') WHERE id=?",
        [name.trim(), description||null, sort_order||0, is_active!==undefined ? (is_active ? 1 : 0) : 1, req.params.id]
      );
    }
    const updated = await db.get("SELECT * FROM categories WHERE id=?", [req.params.id]);
    res.json({ success: true, data: { ...updated, is_raw_material: Boolean(updated.is_raw_material || isRaw) } });
  } catch(e) { next(e); }
});

router.delete("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const check = await db.get("SELECT COUNT(*) as count FROM products WHERE category_id=? AND is_active=1 AND store_id=?", [req.params.id, currentStore]);
    if (check && check.count > 0) {
      return res.status(400).json({
        success: false,
        error: { message: `ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากมีสินค้าใช้งานอยู่ ${check.count} รายการ` }
      });
    }
    await db.run("UPDATE categories SET is_active=0, updated_at=datetime('now', '+7 hours') WHERE id=?", [req.params.id]);
    res.json({ success: true, message: "ลบหมวดหมู่สำเร็จ" });
  } catch(e) { next(e); }
});

module.exports = router;
