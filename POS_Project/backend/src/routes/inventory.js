const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const StorageService = require("../modules/ocr/services/StorageService");
const { generatePONumber } = require("../services/poGenerator");
const {
  applyPendingCostIfInventoryEmpty,
  queueOrApplyProductCost,
} = require("./_productCost");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Real-time helper: Sync product stock quantity to ingredients table for Raw Material items
 */
async function syncProductQtyToIngredient(productId, storeId) {
  try {
    const inv = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [productId, storeId]);
    if (!inv) return;

    const prd = await db.get("SELECT id, sku, is_raw_material, category_id FROM products WHERE id=?", [productId]);
    if (!prd) return;

    let isRawMat = prd.is_raw_material === 1;
    if (!isRawMat && prd.category_id) {
      const cat = await db.get("SELECT name, is_raw_material FROM categories WHERE id=?", [prd.category_id]);
      if (cat && (cat.is_raw_material === 1 || cat.name === 'วัตถุดิบ' || (cat.name && cat.name.includes('วัตถุดิบ')))) {
        isRawMat = true;
      }
    }

    if (isRawMat) {
      await db.run(
        `UPDATE ingredients 
         SET quantity = ?, updated_at = datetime('now', '+7 hours')
         WHERE (id = ? OR sku = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '' OR store_id = 'store-1')`,
        [inv.quantity, productId, prd.sku, storeId]
      );
    }
  } catch (err) {
    console.error("Error syncing product qty to ingredient:", err);
  }
}

// Upload receipt image (compulsory for stock receive)
router.post("/upload-receipt", authenticate, authorize("admin", "manager"), upload.single("receipt"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: "กรุณาแนบรูปภาพใบเสร็จ / หลักฐานการรับสินค้า" } });
    }
    const result = await StorageService.uploadImage(req.file.buffer, req.file.mimetype);
    res.json({ success: true, url: result.url, key: result.key });
  } catch (e) {
    next(e);
  }
});

// GET inventory list
router.get("/", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || 'store-1';
    
    // Auto-ensure every active product for this store has a row in inventory table
    await db.run(
      `INSERT OR IGNORE INTO inventory (product_id, store_id, quantity, reorder_level)
       SELECT p.id, p.store_id, 0, 5 
       FROM products p 
       LEFT JOIN inventory i ON p.id = i.product_id AND i.store_id = p.store_id
       WHERE p.is_active = 1 AND p.store_id = ? AND i.product_id IS NULL`,
      [currentStore]
    );

    const { low_stock } = req.query;
    let q = "SELECT p.id,p.sku,p.barcode,p.name,p.unit,p.is_raw_material,p.net_weight,p.cost_price,p.pending_cost_price,p.selling_price,i.quantity,i.reorder_level,c.name as category_name, (SELECT quantity FROM stock_transactions WHERE product_id = p.id AND type = 'receive' AND store_id = i.store_id ORDER BY created_at DESC LIMIT 1) as last_receive_qty FROM inventory i JOIN products p ON i.product_id=p.id LEFT JOIN categories c ON p.category_id=c.id WHERE p.is_active=1 AND i.store_id=?";
    const params = [currentStore];
    if (low_stock === "true") {
      q += " AND i.quantity<=i.reorder_level";
    }
    q += " ORDER BY p.name";
    res.json({ success: true, data: await db.all(q, params) });
  } catch(e) { next(e); }
});

// GET stock transaction history for a product
router.get("/transactions/:productId", authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const q = `
      SELECT st.*, u.full_name as user_name 
      FROM stock_transactions st
      LEFT JOIN users u ON st.user_id = u.id
      WHERE st.product_id = ? AND st.store_id = ?
      ORDER BY st.created_at DESC
    `;
    const rows = await db.all(q, [productId, req.store_id]);
    res.json({ success: true, data: rows });
  } catch(e) { next(e); }
});

// Single Item Receive
router.post("/receive", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { product_id, quantity, remark, received_date, new_cost_price, payment_method, bank_name, receipt_url } = req.body;
    
    if (!receipt_url) {
      return res.status(400).json({ success: false, error: { message: "กรุณาแนบรูปภาพใบเสร็จ / หลักฐานการรับสินค้าก่อนบันทึก" } });
    }

    const qtyNum = parseInt(quantity, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ success: false, error: { message: "จำนวนสินค้าไม่ถูกต้อง" } });
    }

    const createdAt = received_date ? received_date + ' 00:00:00' : null;
    const inv = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, req.store_id]);
    const currentQty = inv ? inv.quantity : 0;

    const prd = await db.get("SELECT cost_price FROM products WHERE id=? AND store_id=?", [product_id, req.store_id]);
    const activeUnitCost = (new_cost_price !== undefined && new_cost_price !== null && new_cost_price !== "")
      ? parseFloat(new_cost_price)
      : (prd ? prd.cost_price : 0);
    const totalAmount = qtyNum * activeUnitCost;

    // Generate PO Number
    const poNumber = await generatePONumber(req.store_id);
    const poId = uuidv4();

    // Create Purchase Order record
    await db.run(
      `INSERT INTO purchase_orders (id, store_id, po_number, user_id, total_amount, payment_method, bank_name, received_date, receipt_image_url, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [poId, req.store_id, poNumber, req.user.id, totalAmount, payment_method || 'cash', bank_name || null, received_date || new Date().toISOString().slice(0, 10), receipt_url, remark || 'รับเข้าสินค้า']
    );

    // Create Purchase Order Item record
    await db.run(
      `INSERT INTO purchase_order_items (id, po_id, product_id, quantity, unit_cost_price, total_price)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), poId, product_id, qtyNum, activeUnitCost, totalAmount]
    );

    if (currentQty <= 0 && (new_cost_price === undefined || new_cost_price === null || new_cost_price === "")) {
      await applyPendingCostIfInventoryEmpty(product_id, req.store_id, currentQty, req.user.id);
    }

    await db.run("UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [qtyNum, product_id, req.store_id]);

    await queueOrApplyProductCost(product_id, req.store_id, currentQty, new_cost_price, req.user.id);

    // Real-time sync to ingredients table if raw material
    await syncProductQtyToIngredient(product_id, req.store_id);

    const baseRemark = remark || "รับเข้าสต๊อก";
    const finalRemark = new_cost_price && !Number.isNaN(parseFloat(new_cost_price))
      ? `${baseRemark} (ต้นทุน ฿${Number(new_cost_price).toFixed(2)}) [PO: ${poNumber}]`
      : `${baseRemark} [PO: ${poNumber}]`;

    if (createdAt) {
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,created_at,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?,?)",
        [uuidv4(), product_id, req.user.id, qtyNum, finalRemark, createdAt, req.store_id, poNumber, receipt_url]);
    } else {
      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?)",
        [uuidv4(), product_id, req.user.id, qtyNum, finalRemark, req.store_id, poNumber, receipt_url]);
    }

    res.json({ success: true, message: `รับสินค้าสำเร็จ (เลขที่ PO: ${poNumber})`, po_number: poNumber });
  } catch(e) { next(e); }
});

// Multi-Product Batch Receive
router.post("/receive-batch", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { items, received_date, payment_method, bank_name, receipt_url, remark } = req.body;

    if (!receipt_url) {
      return res.status(400).json({ success: false, error: { message: "กรุณาแนบรูปภาพใบเสร็จ / หลักฐานการรับสินค้าก่อนบันทึก" } });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: { message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" } });
    }

    const recDate = received_date || new Date().toISOString().slice(0, 10);
    const createdAt = recDate ? recDate + ' 00:00:00' : null;

    // Generate Single PO Number for the entire batch
    const poNumber = await generatePONumber(req.store_id);
    const poId = uuidv4();

    let grandTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const { product_id, quantity, new_cost_price, remark: itemRemark } = item;
      const qtyNum = parseInt(quantity, 10);
      if (isNaN(qtyNum) || qtyNum <= 0) continue;

      const inv = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, req.store_id]);
      const currentQty = inv ? inv.quantity : 0;

      const prd = await db.get("SELECT cost_price FROM products WHERE id=? AND store_id=?", [product_id, req.store_id]);
      const unitCost = (new_cost_price !== undefined && new_cost_price !== null && new_cost_price !== "")
        ? parseFloat(new_cost_price)
        : (prd ? prd.cost_price : 0);
      
      const lineTotal = qtyNum * unitCost;
      grandTotal += lineTotal;

      processedItems.push({
        product_id,
        quantity: qtyNum,
        unitCost,
        lineTotal,
        new_cost_price,
        currentQty,
        itemRemark
      });
    }

    if (processedItems.length === 0) {
      return res.status(400).json({ success: false, error: { message: "ไม่มีรายการสินค้าที่มีจำนวนถูกต้อง" } });
    }

    // Insert Purchase Order master record
    await db.run(
      `INSERT INTO purchase_orders (id, store_id, po_number, user_id, total_amount, payment_method, bank_name, received_date, receipt_image_url, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [poId, req.store_id, poNumber, req.user.id, grandTotal, payment_method || 'cash', bank_name || null, recDate, receipt_url, remark || 'รับเข้าหลายรายการ']
    );

    // Process each product in transaction
    for (const pi of processedItems) {
      // Insert PO Item
      await db.run(
        `INSERT INTO purchase_order_items (id, po_id, product_id, quantity, unit_cost_price, total_price)
         VALUES (?,?,?,?,?,?)`,
        [uuidv4(), poId, pi.product_id, pi.quantity, pi.unitCost, pi.lineTotal]
      );

      if (pi.currentQty <= 0 && (pi.new_cost_price === undefined || pi.new_cost_price === null || pi.new_cost_price === "")) {
        await applyPendingCostIfInventoryEmpty(pi.product_id, req.store_id, pi.currentQty, req.user.id);
      }

      await db.run("UPDATE inventory SET quantity=quantity+?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [pi.quantity, pi.product_id, req.store_id]);

      await queueOrApplyProductCost(pi.product_id, req.store_id, pi.currentQty, pi.new_cost_price, req.user.id);

      // Real-time sync to ingredients table if raw material
      await syncProductQtyToIngredient(pi.product_id, req.store_id);

      const baseRemark = pi.itemRemark || remark || "รับเข้าสินค้าหลายรายการ";
      const finalRemark = pi.new_cost_price && !Number.isNaN(parseFloat(pi.new_cost_price))
        ? `${baseRemark} (ต้นทุน ฿${Number(pi.new_cost_price).toFixed(2)}) [PO: ${poNumber}]`
        : `${baseRemark} [PO: ${poNumber}]`;

      if (createdAt) {
        await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,created_at,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?,?)",
          [uuidv4(), pi.product_id, req.user.id, pi.quantity, finalRemark, createdAt, req.store_id, poNumber, receipt_url]);
      } else {
        await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?)",
          [uuidv4(), pi.product_id, req.user.id, pi.quantity, finalRemark, req.store_id, poNumber, receipt_url]);
      }
    }

    res.json({
      success: true,
      message: `รับสินค้า ${processedItems.length} รายการสำเร็จ (เลขที่ PO: ${poNumber})`,
      po_number: poNumber,
      total_amount: grandTotal
    });
  } catch(e) { next(e); }
});

router.post("/issue", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, quantity, remark } = req.body;
    await db.run("UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [quantity, product_id, req.store_id]);
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'issue',?,?,?)", [uuidv4(), product_id, req.user.id, -quantity, remark||null, req.store_id]);
    const invAfter = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, req.store_id]);
    await applyPendingCostIfInventoryEmpty(product_id, req.store_id, invAfter ? invAfter.quantity : 0, req.user.id);
    await syncProductQtyToIngredient(product_id, req.store_id);
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
    await applyPendingCostIfInventoryEmpty(product_id, req.store_id, new_quantity, req.user.id);
    await syncProductQtyToIngredient(product_id, req.store_id);
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
