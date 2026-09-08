const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// Auto migration to ensure is_raw_material column exists
db.run("ALTER TABLE categories ADD COLUMN is_raw_material INTEGER DEFAULT 0").catch(() => {});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const allRows = await db.all(
      `SELECT c.*, COUNT(p.id) as product_count 
       FROM categories c 
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 
       WHERE c.is_active=1 AND (c.store_id=? OR c.store_id IS NULL OR c.store_id='' OR c.store_id='store-1') 
       GROUP BY c.id 
       ORDER BY c.sort_order, c.name`,
      [req.store_id]
    );
    const storeSpecific = allRows.filter(c => c.store_id === req.store_id);
    const shared = allRows.filter(c => c.store_id !== req.store_id);
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
    const check = await db.get("SELECT COUNT(*) as count FROM products WHERE category_id=? AND is_active=1", [req.params.id]);
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
