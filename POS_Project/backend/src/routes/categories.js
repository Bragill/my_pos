const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

router.get("/", authenticate, (req, res, next) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM categories WHERE is_active=1 AND store_id=? ORDER BY sort_order,name", [req.store_id]) }); } catch(e) { next(e); }
});
router.post("/", authenticate, authorize("admin","manager"), (req, res, next) => {
  try {
    const { name, description, sort_order } = req.body; const id = uuidv4();
    db.run("INSERT INTO categories (id,name,description,sort_order,store_id) VALUES (?,?,?,?,?)", [id, name, description||null, sort_order||0, req.store_id]);
    res.status(201).json({ success: true, data: db.get("SELECT * FROM categories WHERE id=? AND store_id=?", [id, req.store_id]) });
  } catch(e) { next(e); }
});
router.put("/:id", authenticate, authorize("admin","manager"), (req, res, next) => {
  try {
    const { name, description, sort_order, is_active } = req.body;
    db.run("UPDATE categories SET name=?,description=?,sort_order=?,is_active=?,updated_at=datetime('now') WHERE id=? AND store_id=?", [name, description, sort_order, is_active?1:0, req.params.id, req.store_id]);
    res.json({ success: true, data: db.get("SELECT * FROM categories WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch(e) { next(e); }
});
module.exports = router;
