const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const { low_stock } = req.query;
    let q = "SELECT p.id,p.sku,p.barcode,p.name,p.cost_price,p.selling_price,i.quantity,i.reorder_level,c.name as category_name FROM inventory i JOIN products p ON i.product_id=p.id LEFT JOIN categories c ON p.category_id=c.id WHERE p.is_active=1 AND i.store_id=?";
    const params = [req.store_id];
    if (low_stock === "true") {
      q += " AND i.quantity<=i.reorder_level";
    }
    q += " ORDER BY p.name";
    res.json({ success: true, data: await db.all(q, params) });
  } catch(e) { next(e); }
});
router.post("/receive", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, quantity, remark, received_date } = req.body;
    const createdAt = received_date ? received_date + ' 00:00:00' : null;
    await db.run("UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [quantity, product_id, req.store_id]);
    if (createdAt) {
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,created_at,store_id) VALUES (?,?,?,'receive',?,?,?,?)",
        [uuidv4(), product_id, req.user.id, quantity, remark||null, createdAt, req.store_id]);
    } else {
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'receive',?,?,?)",
        [uuidv4(), product_id, req.user.id, quantity, remark||null, req.store_id]);
    }
    res.json({ success: true, message: "Stock received" });
  } catch(e) { next(e); }
});
router.post("/issue", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, quantity, remark } = req.body;
    await db.run("UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [quantity, product_id, req.store_id]);
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'issue',?,?,?)", [uuidv4(), product_id, req.user.id, -quantity, remark||null, req.store_id]);
    res.json({ success: true, message: "Stock issued" });
  } catch(e) { next(e); }
});
router.post("/adjust", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, new_quantity, remark } = req.body;
    const cur = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, req.store_id]);
    const diff = new_quantity - (cur ? cur.quantity : 0);
    await db.run("UPDATE inventory SET quantity=?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [new_quantity, product_id, req.store_id]);
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'adjust',?,?,?)", [uuidv4(), product_id, req.user.id, diff, remark||"Adjust", req.store_id]);
    res.json({ success: true, message: "Stock adjusted" });
  } catch(e) { next(e); }
});

router.put("/reorder-level", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, reorder_level } = req.body;
    await db.run("UPDATE inventory SET reorder_level=?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [reorder_level, product_id, req.store_id]);
    res.json({ success: true, message: "Reorder level updated" });
  } catch(e) { next(e); }
});

module.exports = router;
