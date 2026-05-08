const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// GET all stores (Admin only)
router.get("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const stores = await db.all("SELECT * FROM stores ORDER BY created_at DESC");
    res.json({ success: true, data: stores });
  } catch (err) { next(err); }
});

// GET current store details
router.get("/current", authenticate, async (req, res, next) => {
  try {
    const store = await db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });
    res.json({ success: true, data: store });
  } catch (err) { next(err); }
});

// CREATE store (Admin only)
router.post("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { name, address, phone, tax_id, promptpay_number, promptpay_name, vat_rate } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });
    const id = uuidv4();
    await db.run("INSERT INTO stores (id, name, address, phone, tax_id, promptpay_number, promptpay_name, vat_rate) VALUES (?,?,?,?,?,?,?,?)",
      [id, name, address || null, phone || null, tax_id || null, promptpay_number || null, promptpay_name || null, vat_rate || 7.00]);
    res.status(201).json({ success: true, data: await db.get("SELECT * FROM stores WHERE id = ?", [id]) });
  } catch (err) { next(err); }
});

// UPDATE store details
router.put("/:id", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    // Managers can only update their own store
    if (req.user.role === 'manager' && req.store_id !== req.params.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }
    const { name, address, phone, tax_id, promptpay_number, promptpay_name, vat_rate, receipt_header, receipt_footer } = req.body;
    
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });

    await db.run("UPDATE stores SET name=?, address=?, phone=?, tax_id=?, promptpay_number=?, promptpay_name=?, vat_rate=?, receipt_header=?, receipt_footer=?, updated_at=datetime('now', '+7 hours') WHERE id=?",
      [
        name, 
        address || null, 
        phone || null, 
        tax_id || null, 
        promptpay_number || null, 
        promptpay_name || null,
        vat_rate ?? 7.00, 
        receipt_header || null, 
        receipt_footer || null, 
        req.params.id
      ]);
    const updatedStore = await db.get("SELECT * FROM stores WHERE id = ?", [req.params.id]);
    console.log("Store updated in DB:", JSON.stringify(updatedStore));
    res.json({ success: true, data: updatedStore });
  } catch (err) { 
    console.error("Error updating store:", err);
    next(err); 
  }
});

// USER-STORE ASSIGNMENTS (Admin only)

// GET stores for a specific user
router.get("/user/:userId", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const rows = await db.all("SELECT store_id FROM user_stores WHERE user_id = ?", [req.params.userId]);
    res.json({ success: true, data: rows.map(r => r.store_id) });
  } catch (err) { next(err); }
});

// UPDATE user assignments
router.post("/assign", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { user_id, store_ids } = req.body; // store_ids is an array
    if (!user_id || !Array.isArray(store_ids)) return res.status(400).json({ success: false, message: "Invalid data" });
    
    // Clear existing
    await db.run("DELETE FROM user_stores WHERE user_id = ?", [user_id]);
    
    // Insert new
    for (const sid of store_ids) {
      await db.run("INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)", [user_id, sid]);
    }
    
    res.json({ success: true, message: "Assignments updated" });
  } catch (err) { next(err); }
});

// DELETE store (Admin only)
router.delete("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const storeId = req.params.id;
    const force = req.query.force === 'true';
    
    // 1. Prevent deleting the only store
    const storeCount = await db.get("SELECT COUNT(*) as cnt FROM stores");
    if (storeCount.cnt <= 1) return next(new AppError("ไม่สามารถลบสาขาสุดท้ายได้", 400));

    // 2. Prevent deleting current active store
    if (storeId === req.store_id) return next(new AppError("ไม่สามารถลบสาขาที่คุณกำลังใช้งานอยู่ได้ กรุณาสลับไปสาขาอื่นก่อน", 400));

    // 3. Check for dependent data (safety first)
    const hasProducts = await db.get("SELECT 1 FROM products WHERE store_id = ? LIMIT 1", [storeId]);
    const hasOrders = await db.get("SELECT 1 FROM orders WHERE store_id = ? LIMIT 1", [storeId]);
    
    if (!force && (hasProducts || hasOrders)) {
      return next(new AppError("ไม่สามารถลบสาขานี้ได้เนื่องจากมีข้อมูลสินค้าหรือยอดขายค้างอยู่ หากต้องการลบจริงๆ กรุณาใช้ตัวเลือก ลบทั้งหมด", 400));
    }

    // 4. If force, clean up all dependent data
    if (force) {
      // Find all orders to delete order_items and payments
      const orderIds = (await db.all("SELECT id FROM orders WHERE store_id = ?", [storeId])).map(o => o.id);
      for (const oid of orderIds) {
        await db.run("DELETE FROM order_items WHERE order_id = ?", [oid]);
        await db.run("DELETE FROM payments WHERE order_id = ?", [oid]);
      }
      await db.run("DELETE FROM orders WHERE store_id = ?", [storeId]);
      
      // Delete products and inventory
      const productIds = (await db.all("SELECT id FROM products WHERE store_id = ?", [storeId])).map(p => p.id);
      for (const pid of productIds) {
        await db.run("DELETE FROM inventory WHERE product_id = ?", [pid]);
      }
      await db.run("DELETE FROM products WHERE store_id = ?", [storeId]);
      
      // Delete other store data
      await db.run("DELETE FROM categories WHERE store_id = ?", [storeId]);
      await db.run("DELETE FROM shifts WHERE store_id = ?", [storeId]);
      await db.run("DELETE FROM stock_transactions WHERE store_id = ?", [storeId]);
      await db.run("DELETE FROM customers WHERE store_id = ?", [storeId]);
      await db.run("DELETE FROM debtors WHERE store_id = ?", [storeId]);
    }

    // 5. Delete the store itself
    await db.run("DELETE FROM stores WHERE id = ?", [storeId]);
    await db.run("DELETE FROM user_stores WHERE store_id = ?", [storeId]);
    
    res.json({ success: true, message: "ลบสาขาสำเร็จ" });
  } catch (err) { next(err); }
});

module.exports = router;
