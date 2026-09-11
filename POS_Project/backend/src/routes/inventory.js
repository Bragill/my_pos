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

    const { low_stock, category_id } = req.query;
    let q = "SELECT p.id,p.sku,p.barcode,p.name,p.unit,p.is_raw_material,p.net_weight,p.cost_price,p.pending_cost_price,p.selling_price,i.quantity,i.reorder_level,c.name as category_name, (SELECT quantity FROM stock_transactions WHERE product_id = p.id AND type = 'receive' AND store_id = i.store_id ORDER BY created_at DESC LIMIT 1) as last_receive_qty FROM inventory i JOIN products p ON i.product_id=p.id AND p.store_id=i.store_id LEFT JOIN categories c ON p.category_id=c.id WHERE p.is_active=1 AND i.store_id=?";
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

    q += ` ORDER BY created_at DESC LIMIT 300`;

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
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const grNumber = await generateGRNumber(currentStore);

    await db.run("UPDATE inventory SET quantity=quantity-?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [quantity, product_id, currentStore]);
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id,gr_number) VALUES (?,?,?,'issue',?,?,?,?)", [uuidv4(), product_id, req.user.id, -quantity, remark||null, currentStore, grNumber]);
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

    await db.run("UPDATE inventory SET quantity=?,updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [targetQty, product_id, storeId]);
    const presetLabel = preset ? `[${preset}] ` : "";
    const finalRemark = `ปรับสต็อก ${presetLabel}${finalDetail} (${currentQty} → ${targetQty})`;
    await db.run("INSERT INTO stock_transactions (id,product_id,user_id,type,quantity,remark,store_id) VALUES (?,?,?,'adjust',?,?,?)", [uuidv4(), product_id, req.user.id, diff, finalRemark, storeId]);
    // Auxiliary bookkeeping must never block the core adjustment
    try {
      await applyPendingCostIfInventoryEmpty(product_id, storeId, targetQty, req.user.id);
    } catch (auxErr) { console.error("[inventory/adjust] pending-cost sync failed:", auxErr.message); }
    try {
      await syncProductQtyToIngredient(product_id, storeId);
    } catch (auxErr) { console.error("[inventory/adjust] ingredient sync failed:", auxErr.message); }
    if (diff < 0) {
      await batchService.deductFromBatches(product_id, storeId, -diff);
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
    await db.run("UPDATE inventory SET reorder_level=?, updated_at=datetime('now', '+7 hours') WHERE product_id=? AND store_id=?", [reorder_level, product_id, req.store_id]);
    res.json({ success: true, message: "Reorder level updated" });
  } catch(e) { next(e); }
});

// GET /batches - list production batches (expiry tracking) for the current store, optionally filtered
router.get("/batches", authenticate, async (req, res, next) => {
  try {
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
        "INSERT INTO stock_transactions (id,store_id,product_id,user_id,type,quantity,remark) VALUES (?,?,?,?,'expired',?,?)",
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
      SELECT po.id, po.store_id, po.po_number, po.user_id, po.total_amount, po.payment_method, po.bank_name, po.received_date, po.receipt_image_url, po.remark, po.created_at,
             COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name
      FROM purchase_orders po
      LEFT JOIN users u ON po.user_id = u.id
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
    res.json({ success: true, data: rows || [] });
  } catch (e) {
    next(e);
  }
});

// GET /purchase-orders/:id - detail of single Purchase Order
router.get("/purchase-orders/:id", authenticate, async (req, res, next) => {
  try {
    const currentStore = req.store_id || req.user?.store_id || 'store-1';
    const po = await db.get(
      `SELECT po.id, po.store_id, po.po_number, po.user_id, po.total_amount, po.payment_method, po.bank_name, po.received_date, po.receipt_image_url, po.remark, po.created_at,
              COALESCE(u.full_name, u.username, 'ผู้ใช้งาน') as user_name
       FROM purchase_orders po
       LEFT JOIN users u ON po.user_id = u.id
       WHERE po.id = ? AND (po.store_id = ? OR po.store_id IS NULL OR po.store_id = '')`,
      [req.params.id, currentStore]
    );

    if (!po) {
      return res.status(404).json({ success: false, error: { message: "ไม่พบข้อมูลใบสั่งซื้อ/รับสินค้า (PO)" } });
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

module.exports = router;
