const express = require("express");
const db = require("../database/dbHelper");
const { authenticate } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
// GET all debtors with outstanding summary
router.get("/", authenticate, async (req, res, next) => {
  try {
    console.log("GET /debtors - store_id:", req.store_id);
    const debtors = await db.all("SELECT * FROM debtors WHERE store_id=? ORDER BY name ASC", [req.store_id]);
    
    // Parallelize summary fetching for performance
    await Promise.all(debtors.map(async (d) => {
      const summary = await db.get(
        "SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount),0) as total_outstanding FROM orders WHERE debtor_id=? AND status IN ('outstanding', 'รอชำระพร้อมเพย์') AND store_id=?",
        [d.id, req.store_id]
      );
      console.log(`Debtor ${d.name} (${d.id}) summary:`, JSON.stringify(summary));
      d.order_count = summary?.order_count || 0;
      d.total_outstanding = summary?.total_outstanding || 0;
      d.orders = await db.all(
        "SELECT id,order_no,total_amount,created_at FROM orders WHERE debtor_id=? AND status IN ('outstanding', 'รอชำระพร้อมเพย์') AND store_id=? ORDER BY created_at DESC",
        [d.id, req.store_id]
      );
    }));

    res.json({ success: true, data: debtors });
  } catch (err) { next(err); }
});

// CREATE debtor
router.post("/", authenticate, async (req, res, next) => {
  try {
    const { name, phone, note } = req.body;
    if (!name?.trim()) return next(new AppError("กรุณากรอกชื่อ", 400));
    const existing = await db.get("SELECT id FROM debtors WHERE name=? AND store_id=?", [name.trim(), req.store_id]);
    if (existing) return next(new AppError("ชื่อนี้มีอยู่แล้ว", 400));
    const id = uuidv4();
    await db.run("INSERT INTO debtors (id,name,phone,note,store_id) VALUES (?,?,?,?,?)", [id, name.trim(), phone||null, note||null, req.store_id]);
    res.status(201).json({ success: true, data: await db.get("SELECT * FROM debtors WHERE id=? AND store_id=?", [id, req.store_id]) });
  } catch (err) { next(err); }
});

// UPDATE debtor
router.put("/:id", authenticate, async (req, res, next) => {
  try {
    const { name, phone, note } = req.body;
    if (!name?.trim()) return next(new AppError("กรุณากรอกชื่อ", 400));
    await db.run("UPDATE debtors SET name=?,phone=?,note=?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [name.trim(), phone||null, note||null, req.params.id, req.store_id]);
    res.json({ success: true, data: await db.get("SELECT * FROM debtors WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch (err) { next(err); }
});

// DELETE debtor
router.delete("/:id", authenticate, async (req, res, next) => {
  try {
    const used = await db.get("SELECT id FROM orders WHERE debtor_id=? AND status IN ('outstanding', 'รอชำระพร้อมเพย์') AND store_id=?", [req.params.id, req.store_id]);
    if (used) return next(new AppError("ไม่สามารถลบได้ เนื่องจากยังมีรายการค้างชำระอยู่", 400));
    await db.run("DELETE FROM debtors WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    res.json({ success: true, message: "ลบสำเร็จ" });
  } catch (err) { next(err); }
});

// GET debtor payment history
router.get("/payments", authenticate, async (req, res, next) => {
  try {
    const { month, debtor_id } = req.query;
    let q = `
      SELECT p.*, o.order_no, o.debtor_name, o.status as order_status, o.total_amount as order_total
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE o.debtor_id IS NOT NULL AND o.store_id = ?
    `;
    const params = [req.store_id];
    
    if (month) {
      q += " AND strftime('%Y-%m', p.created_at) = ?";
      params.push(month);
    }
    if (debtor_id) {
      q += " AND o.debtor_id = ?";
      params.push(debtor_id);
    }
    
    q += " ORDER BY p.created_at DESC";
    
    const payments = await db.all(q, params);
    
    // Get available months for filter
    const months = await db.all(`
      SELECT DISTINCT strftime('%Y-%m', p.created_at) as month 
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE o.debtor_id IS NOT NULL AND o.store_id = ?
      ORDER BY month DESC
    `, [req.store_id]);

    res.json({ success: true, data: { payments, months: months.map(m => m.month) } });
  } catch (err) { next(err); }
});

module.exports = router;
