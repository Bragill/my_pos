const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const router = express.Router();

router.get("/", authenticate, (req, res, next) => {
  try {
    const row = db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row || {} });
  } catch (err) { next(err); }
});

router.put("/", authenticate, authorize("admin", "manager"), (req, res, next) => {
  try {
    const { store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url } = req.body;
    db.run("UPDATE stores SET name=?, address=?, phone=?, tax_id=?, vat_rate=?, receipt_header=?, receipt_footer=?, logo_url=?, updated_at=datetime('now') WHERE id=?", 
      [store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url, req.store_id]);
    const row = db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

module.exports = router;
