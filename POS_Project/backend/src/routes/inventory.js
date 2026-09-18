const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const StorageService = require("../modules/ocr/services/StorageService");
const { generatePONumber, generateGRNumber } = require("../services/poGenerator");
const {
  applyPendingCostIfInventoryEmpty,
  queueOrApplyProductCost,
} = require("./_productCost");
const batchService = require("../services/batchService");
const { isLineApprovalRequired, cancelPurchaseOrder } = require("../services/cancellationService");
const lineService = require("../services/lineService");

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
         WHERE (id = ? OR sku = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')`,
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

    // Auto-expire batches and reconcile orphan stock
    try { await batchService.runExpiryCheck(); } catch (_) {}

    const { low_stock, category_id } = req.query;
    let q = `SELECT p.id,p.sku,p.barcode,p.name,p.unit,p.is_raw_material,p.net_weight,p.cost_price,p.pending_cost_price,p.selling_price,i.quantity,i.reorder_level,c.name as category_name, 
      (SELECT quantity FROM stock_transactions WHERE product_id = p.id AND type = 'receive' AND store_id = i.store_id ORDER BY created_at DESC LIMIT 1) as last_receive_qty,
      (SELECT id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = i.store_id AND status = 'PENDING' AND (payload LIKE '%"' || p.id || '"%' OR document_id = p.id) LIMIT 1) as pending_adjust_id,
      (SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = i.store_id AND status = 'PENDING' AND (payload LIKE '%"' || p.id || '"%' OR document_id = p.id) LIMIT 1) as pending_adjust_doc,
      (SELECT reason FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = i.store_id AND status = 'PENDING' AND (payload LIKE '%"' || p.id || '"%' OR document_id = p.id) LIMIT 1) as pending_adjust_reason
    FROM inventory i 
    JOIN products p ON i.product_id=p.id AND p.store_id=i.store_id 
    LEFT JOIN categories c ON p.category_id=c.id 
    WHERE p.is_active=1 AND i.store_id=?`;
    const params = [currentStore];
    if (low_stock === "true") {
      q += " AND i.quantity<=i.reorder_level";
    }
    if (category_id) {
      q += " AND (p.category_id = ? OR c.name = (SELECT name FROM categories WHERE id = ?))";
      params.push(category_id, category_id);
    }
    q += " ORDER BY p.name";
    res.json({ success: true, data: await db.all(q, params) });
  } catch(e) { next(e); }
});

// GET stock transaction history for a product (combining product stock & raw material ingredient transactions)
router.get("/transactions/:productId", authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const q = `
      SELECT * FROM (
        SELECT st.id, st.product_id, st.user_id, st.type, st.quantity, st.remark, st.created_at, st.store_id, st.po_number, st.gr_number, COALESCE(st.gi_number, st.gr_number) as gi_number, st.receipt_url, COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name 
        FROM stock_transactions st
        LEFT JOIN users u ON st.user_id = u.id
        WHERE st.product_id = ? AND (st.store_id = ? OR st.store_id IS NULL OR st.store_id = '')

        UNION ALL

        SELECT ist.id, ist.ingredient_id as product_id, ist.user_id, ist.type, ist.quantity, ist.remark, ist.created_at, ist.store_id, ist.po_number, ist.gr_number, COALESCE(ist.gi_number, ist.gr_number) as gi_number, NULL as receipt_url, COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name 
        FROM ingredient_stock_transactions ist
        LEFT JOIN users u ON ist.user_id = u.id
        WHERE ist.ingredient_id = ? AND (ist.store_id = ? OR ist.store_id IS NULL OR ist.store_id = '')
          AND ist.id NOT IN (SELECT id FROM stock_transactions WHERE product_id = ?)
      )
      ORDER BY created_at DESC
    `;
    const rows = await db.all(q, [productId, currentStore, productId, currentStore, productId]);
    res.json({ success: true, data: rows || [] });
  } catch(e) {
    console.error("Failed to load inventory transactions", e);
    next(e);
  }
});

// GET global Goods Movement history for store
router.get("/movements", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const { search, type, startDate, endDate } = req.query;

    // Self-heal: Ensure any PO or WO stock_transactions match their source created_at
    try {
      await db.run(`
        UPDATE stock_transactions 
        SET created_at = (SELECT po.created_at FROM purchase_orders po WHERE po.po_number = stock_transactions.po_number LIMIT 1)
        WHERE po_number IS NOT NULL 
          AND created_at LIKE '% 00:00:00'
          AND EXISTS (SELECT 1 FROM purchase_orders po WHERE po.po_number = stock_transactions.po_number)
      `);
      await db.run(`
        UPDATE stock_transactions 
        SET created_at = (SELECT wo.created_at FROM work_orders wo WHERE wo.wo_number = COALESCE(stock_transactions.gr_number, stock_transactions.gi_number) LIMIT 1)
        WHERE (gr_number LIKE 'WO-%' OR gi_number LIKE 'WO-%')
          AND EXISTS (SELECT 1 FROM work_orders wo WHERE wo.wo_number = COALESCE(stock_transactions.gr_number, stock_transactions.gi_number))
      `);
    } catch (_) {}

    let q = `
      SELECT * FROM (
        SELECT 
          st.id, 
          st.product_id, 
          COALESCE(p.name, ing.name, 'สินค้า/วัตถุดิบ') as product_name,
          COALESCE(p.sku, ing.sku, '') as product_sku,
          COALESCE(p.unit, ing.unit, 'ชิ้น') as unit,
          st.user_id, 
          st.type, 
          st.quantity, 
          st.remark, 
          st.created_at, 
          st.store_id, 
          st.po_number, 
          st.gr_number,
          st.gi_number, 
          st.receipt_url, 
          COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name 
        FROM stock_transactions st
        LEFT JOIN products p ON st.product_id = p.id
        LEFT JOIN ingredients ing ON st.product_id = ing.id
        LEFT JOIN users u ON st.user_id = u.id
        WHERE (st.store_id = ? OR st.store_id IS NULL OR st.store_id = '')

        UNION ALL

        SELECT 
          ist.id, 
          ist.ingredient_id as product_id, 
          COALESCE(ing.name, p.name, 'วัตถุดิบ') as product_name,
          COALESCE(ing.sku, p.sku, '') as product_sku,
          COALESCE(ing.unit, p.unit, 'g') as unit,
          ist.user_id, 
          ist.type, 
          ist.quantity, 
          ist.remark, 
          ist.created_at, 
          ist.store_id, 
          ist.po_number, 
          ist.gr_number,
          ist.gi_number, 
          NULL as receipt_url, 
          COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name 
        FROM ingredient_stock_transactions ist
        LEFT JOIN ingredients ing ON ist.ingredient_id = ing.id
        LEFT JOIN products p ON ist.ingredient_id = p.id
        LEFT JOIN users u ON ist.user_id = u.id
        WHERE (ist.store_id = ? OR ist.store_id IS NULL OR ist.store_id = '')
          AND ist.id NOT IN (SELECT id FROM stock_transactions WHERE store_id = ?)
      )
      WHERE 1=1
    `;

    const params = [currentStore, currentStore, currentStore];

    if (type && type !== 'all') {
      q += ` AND type = ?`;
      params.push(type);
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      q += ` AND (product_name LIKE ? OR product_sku LIKE ? OR po_number LIKE ? OR gr_number LIKE ? OR gi_number LIKE ? OR remark LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (startDate) {
      q += ` AND created_at >= ?`;
      params.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      q += ` AND created_at <= ?`;
      params.push(`${endDate} 23:59:59`);
    }

    q += ` ORDER BY created_at DESC, id DESC LIMIT 300`;

    const rows = await db.all(q, params);
    res.json({ success: true, data: rows || [] });
  } catch(e) {
    console.error("Failed to fetch goods movements", e);
    next(e);
  }
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

    // Check if item has pending stock adjust approval
    const pendingApproval = await db.get(
      "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
      [req.store_id, `%"product_id":"${product_id}"%`, product_id]
    );
    if (pendingApproval) {
      return res.status(400).json({
        success: false,
        error: { message: `สินค้านี้มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${pendingApproval.document_id}) ไม่อนุญาตให้ทำรายการรับเข้าสต็อกจนกว่าจะได้รับอนุมัติ` }
      });
    }

    const bkkTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
    const bkkToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const recDate = received_date || bkkToday;
    const createdAt = `${recDate} ${bkkTime}`;

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
      `INSERT INTO purchase_orders (id, store_id, po_number, user_id, total_amount, payment_method, bank_name, received_date, receipt_image_url, remark, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [poId, req.store_id, poNumber, req.user.id, totalAmount, payment_method || 'cash', bank_name || null, recDate, receipt_url, remark || 'รับเข้าสินค้า', createdAt]
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

    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,created_at,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?,?)",
      [uuidv4(), product_id, req.user.id, qtyNum, finalRemark, createdAt, req.store_id, poNumber, receipt_url]);

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

    // Check if any item in batch has pending stock adjust approval
    for (const item of items) {
      const pendingApproval = await db.get(
        "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
        [req.store_id, `%"product_id":"${item.product_id}"%`, item.product_id]
      );
      if (pendingApproval) {
        const prd = await db.get("SELECT name FROM products WHERE id=? AND store_id=?", [item.product_id, req.store_id]);
        return res.status(400).json({
          success: false,
          error: { message: `สินค้า "${prd?.name || item.product_id}" มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${pendingApproval.document_id}) ไม่สามารถรับเข้าสินค้าได้จนกว่าจะได้รับอนุมัติ` }
        });
      }
    }

    const bkkTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
    const bkkToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const recDate = received_date || bkkToday;
    const createdAt = `${recDate} ${bkkTime}`;

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
      `INSERT INTO purchase_orders (id, store_id, po_number, user_id, total_amount, payment_method, bank_name, received_date, receipt_image_url, remark, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [poId, req.store_id, poNumber, req.user.id, grandTotal, payment_method || 'cash', bank_name || null, recDate, receipt_url, remark || 'รับเข้าหลายรายการ', createdAt]
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

      await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,created_at,store_id,po_number,receipt_url) VALUES (?,?,?,'receive',?,?,?,?,?,?)",
        [uuidv4(), pi.product_id, req.user.id, pi.quantity, finalRemark, createdAt, req.store_id, poNumber, receipt_url]);
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
    const currentStore = req.store_id || req.user?.store_id || 'store-1';

    const pendingApproval = await db.get(
      "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
      [currentStore, `%"product_id":"${product_id}"%`, product_id]
    );
    if (pendingApproval) {
      return res.status(400).json({
        success: false,
        error: { message: `สินค้านี้มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${pendingApproval.document_id}) ไม่สามารถเบิกสินค้าได้จนกว่าจะได้รับอนุมัติ` }
      });
    }

    const grNumber = await generateGRNumber(currentStore);

    await db.run("UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [quantity, product_id, currentStore]);
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,gr_number,created_at) VALUES (?,?,?,'issue',?,?,?,?,datetime('now', '+7 hours'))", [uuidv4(), product_id, req.user.id, -quantity, remark||null, currentStore, grNumber]);
    const invAfter = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, currentStore]);
    await applyPendingCostIfInventoryEmpty(product_id, currentStore, invAfter ? invAfter.quantity : 0, req.user.id);
    await syncProductQtyToIngredient(product_id, currentStore);
    await batchService.deductFromBatches(product_id, currentStore, quantity);
    res.json({ success: true, message: `เบิกสต๊อกสำเร็จ (เลขที่ GR: ${grNumber})`, gr_number: grNumber });
  } catch(e) { next(e); }
});

router.post("/adjust", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, mode, quantity, new_quantity, remark, reason_preset, reason_detail, reason } = req.body;
    const storeId = req.store_id || req.user?.store_id || 'store-1';
    if (!product_id) {
      return res.status(400).json({ success: false, error: { message: "กรุณาระบุสินค้า" } });
    }

    // Mandatory reason: accept remark / reason / reason_detail + preset
    const preset = (reason_preset || "").toString().trim();
    const detail = (reason_detail ?? reason ?? remark ?? "").toString().trim();
    const finalDetail = detail;
    if (!finalDetail || finalDetail.length < 3) {
      return res.status(400).json({ success: false, error: { message: "กรุณาระบุเหตุผลการปรับสต็อก (อย่างน้อย 3 ตัวอักษร)" } });
    }

    const cur = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [product_id, storeId]);
    if (!cur) {
      return res.status(404).json({ success: false, error: { message: "ไม่พบข้อมูลสต็อกสินค้านี้" } });
    }
    const currentQty = parseFloat(cur.quantity) || 0;

    let targetQty;
    const normMode = (mode || "").toString().toLowerCase();
    if (normMode === "add" || normMode === "receive" || normMode === "+") {
      const qtyNum = parseFloat(quantity);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        return res.status(400).json({ success: false, error: { message: "จำนวนที่ปรับไม่ถูกต้อง" } });
      }
      targetQty = currentQty + qtyNum;
    } else if (normMode === "remove" || normMode === "issue" || normMode === "-") {
      const qtyNum = parseFloat(quantity);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        return res.status(400).json({ success: false, error: { message: "จำนวนที่ปรับไม่ถูกต้อง" } });
      }
      targetQty = currentQty - qtyNum;
    } else {
      // set-to mode (also backward compatible with legacy { new_quantity })
      const rawTarget = new_quantity !== undefined ? new_quantity : quantity;
      targetQty = parseFloat(rawTarget);
      if (rawTarget === undefined || rawTarget === "" || !Number.isFinite(targetQty)) {
        return res.status(400).json({ success: false, error: { message: "จำนวนสต็อกใหม่ไม่ถูกต้อง" } });
      }
    }

    // Round to 4 decimals to avoid float noise (supports kg like 9.94)
    targetQty = Math.round(targetQty * 10000) / 10000;
    if (targetQty < 0) {
      return res.status(400).json({ success: false, error: { message: `สต็อกคงเหลือไม่เพียงพอ (คงเหลือ ${currentQty})` } });
    }
    const diff = Math.round((targetQty - currentQty) * 10000) / 10000;
    if (diff === 0) {
      return res.status(400).json({ success: false, error: { message: "ยอดใหม่เท่ากับยอดเดิม ไม่มีการเปลี่ยนแปลง" } });
    }

    // Check if LINE approval is required
    const lineRequired = await isLineApprovalRequired(storeId);
    if (lineRequired) {
      const prd = await db.get("SELECT name, sku, unit FROM products WHERE id=? AND store_id=?", [product_id, storeId]);
      const productName = prd?.name || 'สินค้า';
      const productSku = prd?.sku || '';
      const productUnit = prd?.unit || 'ชิ้น';

      // Check if there is already a PENDING approval for this product
      const existingPending = await db.get(
        "SELECT id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
        [storeId, `%"product_id":"${product_id}"%`, product_id]
      );
      if (existingPending) {
        return res.status(400).json({
          success: false,
          error: { message: `สินค้านี้ (${productName}) มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE แล้ว กรุณารอการอนุมัติก่อนทำรายการใหม่` }
        });
      }

      const docNumber = `ADJ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const approvalPayload = JSON.stringify({
        product_id,
        product_name: productName,
        product_sku: productSku,
        unit: productUnit,
        mode: normMode,
        diff,
        previous_quantity: currentQty,
        target_quantity: targetQty,
        reason_preset: preset,
        reason_detail: finalDetail
      });

      const approval = {
        id: uuidv4(),
        store_id: storeId,
        document_type: 'stock_adjust',
        document_id: docNumber,
        amount: Math.abs(diff),
        reason: `${preset ? `[${preset}] ` : ''}${finalDetail}`.trim(),
        requester_id: req.user.id,
        requester_name: req.user.full_name || req.user.username || 'Staff',
        status: 'PENDING',
        payload: approvalPayload
      };

      await db.run(`
        INSERT INTO approval_requests
        (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `, [
        approval.id,
        approval.store_id,
        approval.document_type,
        approval.document_id,
        approval.amount,
        approval.reason,
        approval.requester_id,
        approval.requester_name,
        approval.payload
      ]);

      try {
        await lineService.sendApprovalRequestNotification(approval);
      } catch (lineErr) {
        console.warn('[Stock Adjust] Failed to push notification to LINE:', lineErr.message);
      }

      return res.json({
        success: true,
        requires_approval: true,
        message: `ส่งคำขออนุมัติการปรับสต็อก "${productName}" (${diff > 0 ? '+' : ''}${diff} ${productUnit}) ไปยัง LINE เรียบร้อยแล้ว`,
        data: approval
      });
    }

    await db.run("UPDATE inventory SET quantity=?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [targetQty, product_id, storeId]);
    const presetLabel = preset ? `[${preset}] ` : "";
    const finalRemark = `ปรับสต็อก ${presetLabel}${finalDetail} (${currentQty} → ${targetQty})`;
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,created_at) VALUES (?,?,?,'adjust',?,?,?,datetime('now', '+7 hours'))", [uuidv4(), product_id, req.user.id, diff, finalRemark, storeId]);
    // Auxiliary bookkeeping must never block the core adjustment
    try {
      await applyPendingCostIfInventoryEmpty(product_id, storeId, targetQty, req.user.id);
    } catch (auxErr) { console.error("[inventory/adjust] pending-cost sync failed:", auxErr.message); }
    try {
      await syncProductQtyToIngredient(product_id, storeId);
    } catch (auxErr) { console.error("[inventory/adjust] ingredient sync failed:", auxErr.message); }
    if (diff < 0) {
      await batchService.deductFromBatches(product_id, storeId, -diff);
    } else if (diff > 0) {
      await batchService.restoreToBatches(product_id, storeId, diff);
    }
    res.json({ success: true, message: `ปรับสต็อกสำเร็จ (${currentQty} → ${targetQty})`, previous_quantity: currentQty, new_quantity: targetQty, diff });
  } catch(e) {
    console.error("[inventory/adjust] failed:", e.message, "| body:", JSON.stringify(req.body));
    next(e);
  }
});

router.put("/reorder-level", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { product_id, reorder_level } = req.body;
    const pendingApproval = await db.get(
      "SELECT document_id FROM approval_requests WHERE document_type = 'stock_adjust' AND store_id = ? AND status = 'PENDING' AND (payload LIKE ? OR document_id = ?)",
      [req.store_id, `%"product_id":"${product_id}"%`, product_id]
    );
    if (pendingApproval) {
      return res.status(400).json({
        success: false,
        error: { message: `สินค้านี้มีคำขอปรับสต็อกรอการอนุมัติอยู่ใน LINE (#${pendingApproval.document_id}) ไม่สามารถแก้ไขจุดสั่งซื้อได้จนกว่าจะได้รับอนุมัติ` }
      });
    }
    await db.run("UPDATE inventory SET reorder_level=?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [reorder_level, product_id, req.store_id]);
    res.json({ success: true, message: "Reorder level updated" });
  } catch(e) { next(e); }
});

// GET /batches - list production batches (expiry tracking) for the current store, optionally filtered
router.get("/batches", authenticate, async (req, res, next) => {
  try {
    try { await batchService.runExpiryCheck(); } catch (_) {}
    const { product_id, status } = req.query;
    let query = `
      SELECT b.*, p.name as product_name, p.sku,
        CASE
          WHEN b.expiry_date IS NULL THEN NULL
          ELSE CAST((julianday(b.expiry_date) - julianday(datetime('now','+7 hours'))) AS INTEGER)
        END as days_until_expiry
      FROM product_batches b
      LEFT JOIN products p ON p.id = b.product_id
      WHERE b.store_id = ?
    `;
    const params = [req.store_id];

    if (product_id) {
      query += " AND b.product_id = ?";
      params.push(product_id);
    }
    if (status) {
      query += " AND b.status = ?";
      params.push(status);
    }

    query += " ORDER BY (b.expiry_date IS NULL), b.expiry_date ASC, b.produced_at DESC";

    const batches = await db.all(query, params);
    res.json({ success: true, data: batches });
  } catch (e) { next(e); }
});

// POST /batches/:id/writeoff - manually force-remove a batch's remaining stock (e.g. found damaged/spoiled early)
router.post("/batches/:id/writeoff", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const batch = await db.get("SELECT * FROM product_batches WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!batch) return res.status(404).json({ success: false, error: { message: "ไม่พบข้อมูลล็อตสินค้า" } });
    if (batch.status !== 'active' || parseFloat(batch.qty_remaining) <= 0) {
      return res.status(400).json({ success: false, error: { message: "ล็อตนี้ไม่มีสต็อกคงเหลือให้ตัดออก" } });
    }

    const inv = await db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [batch.product_id, req.store_id]);
    const currentQty = inv ? (parseFloat(inv.quantity) || 0) : 0;
    const removeQty = Math.min(parseFloat(batch.qty_remaining) || 0, currentQty);

    const reasonText = (req.body?.remark || req.body?.reason_detail || req.body?.reason || "").toString().trim();
    if (!reasonText || reasonText.length < 3) {
      return res.status(400).json({ success: false, error: { message: "กรุณาระบุเหตุผลการตัดสต็อกล็อต (อย่างน้อย 3 ตัวอักษร)" } });
    }

    if (removeQty > 0) {
      await db.run("UPDATE inventory SET quantity=quantity-?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [removeQty, batch.product_id, req.store_id]);
      await db.run(
        "UPDATE ingredients SET quantity=quantity-?, updated_at=datetime('now', '+7 hours') WHERE (id=? OR sku=(SELECT sku FROM products WHERE id=?)) AND (store_id=? OR store_id IS NULL OR store_id='')",
        [removeQty, batch.product_id, batch.product_id, req.store_id]
      ).catch(() => {});
      await db.run(
        "INSERT INTO stock_transactions (id,store_id,product_id,user_id,type,quantity,remark,created_at) VALUES (?,?,?,?,'expired',?,?,datetime('now', '+7 hours'))",
        [uuidv4(), req.store_id, batch.product_id, req.user.id, -removeQty, `ตัดสต็อกล็อต (Batch ${batch.wo_number || batch.id}): ${reasonText}`]
      );
    }

    await db.run(
      "UPDATE product_batches SET status='expired', qty_remaining=0, expired_at=datetime('now','+7 hours'), updated_at=datetime('now','+7 hours') WHERE id=?",
      [batch.id]
    );

    res.json({ success: true, message: `ตัดสต็อกล็อตสำเร็จ (-${removeQty})` });
  } catch (e) { next(e); }
});

// GET /purchase-orders - list Purchase Orders with filtering
router.get("/purchase-orders", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const { startDate, endDate, search, paymentMethod } = req.query;

    let q = `
      SELECT po.*,
             COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name,
             ar.status as ar_status,
             ar.created_at as ar_cancel_requested_at,
             ar.requester_name as ar_cancel_requester_name,
             ar.responded_at as ar_approved_at,
             ar.approver_name as ar_approver_name
      FROM purchase_orders po
      LEFT JOIN users u ON po.user_id = u.id
      LEFT JOIN (
        SELECT document_id, store_id, MAX(created_at) as created_at, MAX(responded_at) as responded_at, MAX(approver_name) as approver_name, MAX(requester_name) as requester_name, MAX(status) as status
        FROM approval_requests
        GROUP BY document_id, store_id
      ) ar ON (po.po_number = ar.document_id OR po.id = ar.document_id) AND (po.store_id = ar.store_id OR po.store_id IS NULL OR po.store_id = '')
      WHERE (po.store_id = ? OR po.store_id IS NULL OR po.store_id = '')
    `;
    const params = [currentStore];

    if (startDate) {
      q += ` AND (po.received_date >= ? OR po.created_at >= ?)`;
      params.push(startDate, `${startDate} 00:00:00`);
    }

    if (endDate) {
      q += ` AND (po.received_date <= ? OR po.created_at <= ?)`;
      params.push(endDate, `${endDate} 23:59:59`);
    }

    if (paymentMethod && paymentMethod !== 'all' && paymentMethod !== '') {
      q += ` AND po.payment_method = ?`;
      params.push(paymentMethod);
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      q += ` AND (po.po_number LIKE ? OR po.remark LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    q += ` ORDER BY po.created_at DESC LIMIT 300`;

    const rows = await db.all(q, params);
    const processedRows = (rows || []).map(row => {
      let currentStatus = row.status;
      if ((currentStatus === 'รออนุมัติ' || currentStatus === 'pending_approval') && row.ar_status === 'APPROVED') {
        currentStatus = 'cancelled';
        db.run(
          "UPDATE purchase_orders SET status = 'cancelled', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')) WHERE id = ?",
          [row.ar_approver_name || 'ผู้จัดการ', row.ar_approved_at, row.id]
        ).catch(() => {});
      }
      return {
        ...row,
        status: currentStatus,
        cancel_requested_at: row.cancel_requested_at || row.ar_cancel_requested_at || null,
        cancel_requester_name: row.cancel_requester_name || row.ar_cancel_requester_name || null,
        approved_at: row.approved_at || row.ar_approved_at || null,
        approver_name: row.approver_name || row.ar_approver_name || null
      };
    });
    res.json({ success: true, data: processedRows });
  } catch (e) {
    next(e);
  }
});

// GET /purchase-orders/:id - detail of single Purchase Order
router.get("/purchase-orders/:id", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const po = await db.get(
      `SELECT po.*,
              COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name
       FROM purchase_orders po
       LEFT JOIN users u ON po.user_id = u.id
       WHERE po.id = ? AND (po.store_id = ? OR po.store_id IS NULL OR po.store_id = '')`,
      [req.params.id, currentStore]
    );

    if (!po) {
      return res.status(404).json({ success: false, error: { message: "ไม่พบข้อมูลใบสั่งซื้อ/รับสินค้า (PO)" } });
    }

    // Fallback cancel and approver info from approval_requests if not populated on po
    const approval = await db.get(`
      SELECT status as approval_status, created_at as cancel_requested_at, responded_at as approval_responded_at, requester_name, approver_name
      FROM approval_requests
      WHERE (document_id = ? OR document_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')
      ORDER BY created_at DESC LIMIT 1
    `, [po.po_number, po.id, currentStore]);

    if (approval) {
      if ((po.status === 'รออนุมัติ' || po.status === 'pending_approval') && approval.approval_status === 'APPROVED') {
        po.status = 'cancelled';
        db.run(
          "UPDATE purchase_orders SET status = 'cancelled', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')) WHERE id = ?",
          [approval.approver_name || 'ผู้จัดการ', approval.approval_responded_at, po.id]
        ).catch(() => {});
      }
      if (!po.cancel_requested_at) po.cancel_requested_at = approval.cancel_requested_at;
      if (!po.cancel_requester_name) po.cancel_requester_name = approval.requester_name;
      if (!po.approved_at) po.approved_at = approval.approval_responded_at;
      if (!po.approver_name) po.approver_name = approval.approver_name;
    }

    const items = await db.all(
      `SELECT poi.id, poi.po_id, poi.product_id, poi.quantity, poi.unit_cost_price, poi.total_price,
              COALESCE(p.name, ing.name, 'สินค้า/วัตถุดิบ') as product_name,
              COALESCE(p.sku, ing.sku, '') as sku,
              COALESCE(p.unit, ing.unit, 'ชิ้น') as unit
       FROM purchase_order_items poi
       LEFT JOIN products p ON poi.product_id = p.id
       LEFT JOIN ingredients ing ON poi.product_id = ing.id
       WHERE poi.po_id = ?`,
      [po.id]
    );

    res.json({ success: true, data: { ...po, items: items || [] } });
  } catch (e) {
    next(e);
  }
});

// POST /purchase-orders/:id/cancel - Cancel Purchase Order & rollback inventory
router.post("/purchase-orders/:id/cancel", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const { reason } = req.body || {};

    const po = await db.get(
      `SELECT * FROM purchase_orders WHERE (id = ? OR po_number = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')`,
      [req.params.id, req.params.id, currentStore]
    );

    if (!po) {
      return res.status(404).json({ success: false, error: { message: "ไม่พบข้อมูลใบสั่งซื้อ/รับสินค้า (PO)" } });
    }

    if (po.status === 'cancelled' || (po.remark && po.remark.includes('[ยกเลิกเมื่อ'))) {
      return res.status(400).json({ success: false, error: { message: "ใบรับสินค้านี้ถูกยกเลิกไปแล้ว" } });
    }

    if (po.status === 'รออนุมัติ' || po.status === 'pending_approval') {
      return res.status(400).json({ success: false, error: { message: "ใบรับสินค้านี้อยู่ระหว่างรอการอนุมัติผ่าน LINE" } });
    }

    const lineRequired = await isLineApprovalRequired(currentStore);

    if (lineRequired) {
      // 1. Update PO status to 'รออนุมัติ'
      try { await db.run("ALTER TABLE purchase_orders ADD COLUMN status TEXT DEFAULT 'completed'"); } catch (_) {}
      try { await db.run("ALTER TABLE purchase_orders ADD COLUMN cancel_requested_at TEXT"); } catch (_) {}
      try { await db.run("ALTER TABLE purchase_orders ADD COLUMN cancel_requester_name TEXT"); } catch (_) {}

      const requesterName = req.user?.full_name || req.user?.username || 'Staff';
      await db.run(
        "UPDATE purchase_orders SET status = 'รออนุมัติ', remark = COALESCE(remark || ' | ', '') || ?, cancel_requested_at = datetime('now', '+7 hours'), cancel_requester_name = ? WHERE id = ?",
        [`[รออนุมัติยกเลิก: ${reason}]`, requesterName, po.id]
      );

      let approval = await db.get(
        "SELECT * FROM approval_requests WHERE document_id = ? AND store_id = ? AND status = 'PENDING'",
        [po.po_number || po.id, currentStore]
      );

      if (!approval) {
        const poItems = await db.all(`
          SELECT poi.quantity, poi.unit_cost_price, poi.total_price,
                 COALESCE(p.name, i.name, 'สินค้า/วัตถุดิบ') as name,
                 COALESCE(p.unit, i.unit, 'หน่วย') as unit
          FROM purchase_order_items poi
          LEFT JOIN products p ON poi.product_id = p.id
          LEFT JOIN ingredients i ON poi.product_id = i.id
          WHERE poi.po_id = ?
        `, [po.id]);

        const approvalPayload = {
          items: poItems,
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          received_date: po.received_date,
          total_amount: po.total_amount
        };

        approval = {
          id: uuidv4(),
          store_id: currentStore,
          document_type: 'po_cancel',
          document_id: po.po_number || po.id,
          amount: parseFloat(po.total_amount) || 0,
          reason: reason || 'ขอยกเลิกใบสั่งซื้อ/รับสินค้า (PO)',
          requester_id: req.user.id,
          requester_name: req.user.full_name || req.user.username || 'Staff',
          status: 'PENDING',
          payload: JSON.stringify(approvalPayload)
        };

        await db.run(`
          INSERT INTO approval_requests
          (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [
          approval.id,
          approval.store_id,
          approval.document_type,
          approval.document_id,
          approval.amount,
          approval.reason,
          approval.requester_id,
          approval.requester_name,
          approval.payload
        ]);

        try {
          await lineService.sendApprovalRequestNotification(approval);
        } catch (lineErr) {
          console.warn('[PO Cancel] Failed to push notification to LINE:', lineErr.message);
        }
      }

      return res.json({
        success: true,
        requires_approval: true,
        message: `ส่งคำขออนุมัติยกเลิกใบรับสินค้า #${po.po_number} ไปยัง LINE เรียบร้อยแล้ว`,
        data: approval
      });
    }

    // Direct execution
    const result = await cancelPurchaseOrder({
      poId: po.id,
      storeId: currentStore,
      requesterId: req.user.id,
      approverName: req.user.full_name || req.user.username || 'Admin/Manager',
      reason
    });

    res.json({
      success: true,
      requires_approval: false,
      message: result.message || "ยกเลิกใบสั่งซื้อและหักคืนยอดสต็อกเรียบร้อยแล้ว",
      data: result
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
