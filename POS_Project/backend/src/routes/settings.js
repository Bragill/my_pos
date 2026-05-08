const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const row = await db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row || {} });
  } catch (err) { next(err); }
});

router.put("/", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url } = req.body;
    await db.run("UPDATE stores SET name=?, address=?, phone=?, tax_id=?, vat_rate=?, receipt_header=?, receipt_footer=?, logo_url=?, updated_at=datetime('now', '+7 hours') WHERE id=?", 
      [store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url, req.store_id]);
    const row = await db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

module.exports = router;
