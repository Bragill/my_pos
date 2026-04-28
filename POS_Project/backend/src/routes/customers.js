const express = require("express");
const db = require("../database/dbHelper");
const { authenticate } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

router.get("/", authenticate, (req, res, next) => {
  try {
    const { search, page=1, limit=20 } = req.query;
    const offset = (page-1)*limit; let where="WHERE store_id=?"; const params=[req.store_id];
    if (search) { where += " AND (name LIKE ? OR phone LIKE ? OR member_code LIKE ?)"; const s="%"+search+"%"; params.push(s,s,s); }
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: db.all("SELECT * FROM customers "+where+" ORDER BY name LIMIT ? OFFSET ?", params) });
  } catch(e) { next(e); }
});
router.post("/", authenticate, (req, res, next) => {
  try {
    const { name, phone, email } = req.body; const id = uuidv4();
    db.run("INSERT INTO customers (id,member_code,name,phone,email,store_id) VALUES (?,?,?,?,?,?)", [id, "MBR-"+Date.now(), name, phone||null, email||null, req.store_id]);
    res.status(201).json({ success: true, data: db.get("SELECT * FROM customers WHERE id=? AND store_id=?", [id, req.store_id]) });
  } catch(e) { next(e); }
});
router.get("/:id", authenticate, (req, res, next) => {
  try {
    const c = db.get("SELECT * FROM customers WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!c) return res.status(404).json({ success: false, error: { message: "Not found" } });
    c.purchase_history = db.all("SELECT id,order_no,total_amount,payment_method,created_at FROM orders WHERE customer_id=? AND status='completed' AND store_id=? ORDER BY created_at DESC LIMIT 20", [req.params.id, req.store_id]);
    res.json({ success: true, data: c });
  } catch(e) { next(e); }
});
router.put("/:id", authenticate, (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    db.run("UPDATE customers SET name=?,phone=?,email=?,updated_at=datetime('now') WHERE id=? AND store_id=?", [name, phone, email, req.params.id, req.store_id]);
    res.json({ success: true, data: db.get("SELECT * FROM customers WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch(e) { next(e); }
});
module.exports = router;
