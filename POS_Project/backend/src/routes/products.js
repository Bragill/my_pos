const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const { normalizeCost } = require("./_productCost");
const router = express.Router();

router.get("/deleted", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { search } = req.query;
    let where = "WHERE p.is_active = 0 AND p.store_id = ?";
    const params = [req.store_id];
    if (search) { where += " AND (p.name LIKE ? OR p.sku LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    const rows = await db.all(`SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity
      FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id
      ${where} ORDER BY p.updated_at DESC`, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post("/:id/restore", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const product = await db.get("SELECT id,name FROM products WHERE id=? AND is_active=0 AND store_id=?", [req.params.id, req.store_id]);
    if (!product) return next(new AppError("ไม่พบสินค้าที่ถูกลบ", 404));
    await db.run("UPDATE products SET is_active=1, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    res.json({ success: true, message: `กู้คืนสินค้า "${product.name}" สำเร็จ` });
  } catch (err) { next(err); }
});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const { search, category_id, page = 1, limit = 50, featured, raw_material } = req.query;
    const offset = (page - 1) * limit;
    const currentStore = req.store_id || 'store-1';
    let where = "WHERE p.is_active = 1 AND p.store_id = ?";
    const params = [currentStore];
    if (search) { where += " AND (p.name LIKE ? OR p.barcode = ? OR p.sku LIKE ?)"; params.push("%"+search+"%", search, "%"+search+"%"); }
    if (category_id) { where += " AND p.category_id = ?"; params.push(category_id); }
    if (featured === "true") { where += " AND p.is_featured = 1"; }
    if (raw_material === "false") { where += " AND (p.is_raw_material = 0 OR p.is_raw_material IS NULL)"; }
    if (raw_material === "true") { where += " AND p.is_raw_material = 1"; }
    const countRow = await db.get("SELECT COUNT(*) as cnt FROM products p " + where, params);
    params.push(parseInt(limit), parseInt(offset));
    const rows = await db.all("SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity, (SELECT quantity FROM stock_transactions WHERE product_id = p.id AND type = 'receive' AND store_id = p.store_id ORDER BY created_at DESC LIMIT 1) as last_receive_qty FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id " + where + " ORDER BY p.is_featured DESC, p.name ASC LIMIT ? OFFSET ?", params);
    res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: countRow ? countRow.cnt : 0 } });
  } catch (err) { next(err); }
});

router.get("/barcode/:barcode", authenticate, async (req, res, next) => {
  try {
    const row = await db.get("SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id WHERE p.barcode=? AND p.is_active=1 AND p.store_id=?", [req.params.barcode, req.store_id]);
    if (!row) return res.status(404).json({ success: false, error: { message: "Product not found" } });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// Generate unique SKU — must be before /:id
router.get("/generate-sku", authenticate, async (req, res, next) => {
  try {
    const { prefix = "PRD" } = req.query;
    let sku, exists;
    do {
      const num = String(Math.floor(Math.random() * 900000) + 100000);
      sku = `${prefix.toUpperCase()}${num}`;
      exists = await db.get("SELECT id FROM products WHERE sku=? AND store_id=?", [sku, req.store_id]);
    } while (exists);
    res.json({ success: true, data: { sku } });
  } catch (err) { next(err); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const row = await db.get("SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id WHERE p.id=? AND p.store_id=?", [req.params.id, req.store_id]);
    if (!row) return res.status(404).json({ success: false, error: { message: "Product not found" } });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

function normalizeUnitKey(unitStr) {
  if (!unitStr) return '';
  const u = String(unitStr).trim().toLowerCase();
  if (u === 'kg' || u === 'กิโลกรัม' || u === 'กก' || u === 'ก.ก.') return 'kg';
  if (u === 'g' || u === 'กรัม') return 'g';
  if (u === 'ml' || u === 'มิลลิลิตร') return 'ml';
  if (u === 'l' || u === 'ลิตร') return 'L';
  if (u === 'oz' || u === 'ออนซ์') return 'oz';
  if (u === 'ถุง' || u === 'bag') return 'ถุง';
  if (u === 'ขวด' || u === 'bottle') return 'ขวด';
  if (u === 'กล่อง' || u === 'box') return 'กล่อง';
  if (u === 'แพ็ค' || u === 'pack') return 'แพ็ค';
  if (u === 'แก้ว' || u === 'cup') return 'แก้ว';
  if (u === 'กระป๋อง' || u === 'can') return 'กระป๋อง';
  if (u === 'แผ่น' || u === 'sheet') return 'แผ่น';
  if (u === 'ชุด' || u === 'set') return 'ชุด';
  if (u === 'ชิ้น' || u === 'pcs' || u === 'piece') return 'ชิ้น';
  return unitStr;
}

router.post("/", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    console.log('[POST /api/products] Received payload:', JSON.stringify(req.body));
    const { sku, barcode, name, description, category_id, cost_price, selling_price, image_url, is_featured, is_raw_material, unit, net_weight, reorder_level } = req.body;
    if (!sku) return next(new AppError("SKU is required", 400));
    
    let resolvedCategoryId = category_id || null;
    if (!resolvedCategoryId) {
      const other = await db.get("SELECT id FROM categories WHERE name='อื่นๆ' AND (store_id=? OR store_id IS NULL OR store_id='') LIMIT 1", [req.store_id]);
      if (other) resolvedCategoryId = other.id;
    }

    let isRawMatCategory = false;
    if (resolvedCategoryId) {
      const catObj = await db.get("SELECT name FROM categories WHERE id=?", [resolvedCategoryId]);
      if (catObj && (catObj.name === 'วัตถุดิบ' || catObj.name.includes('วัตถุดิบ'))) {
        isRawMatCategory = true;
      }
    }

    const id = uuidv4();
    const rawMatFlag = (is_raw_material === 1 || is_raw_material === true || is_raw_material === '1' || is_raw_material === 'true' || isRawMatCategory) ? 1 : 0;
    const finalSellingPrice = rawMatFlag ? 0 : (parseFloat(selling_price) || 0);
    const finalNetWeight = parseFloat(net_weight) || 1;
    
    let normalizedUnit = normalizeUnitKey(unit);
    if (rawMatFlag && (normalizedUnit === 'ชิ้น' || !normalizedUnit)) {
      normalizedUnit = 'g';
    } else if (!normalizedUnit) {
      normalizedUnit = 'ชิ้น';
    }
    const finalUnit = normalizedUnit;
    const finalBarcode = (barcode && String(barcode).trim()) ? String(barcode).trim() : null;

    console.log(`[POST /api/products] Saving product "${name}" with unit="${finalUnit}" (rawInput="${unit}")`);

    await db.run("INSERT INTO products (id,sku,barcode,name,description,category_id,cost_price,selling_price,image_url,is_featured,is_raw_material,unit,net_weight,store_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, sku, finalBarcode, name, description||null, resolvedCategoryId, parseFloat(cost_price)||0, finalSellingPrice, image_url||null, is_featured?1:0, rawMatFlag, finalUnit, finalNetWeight, req.store_id]);
    await db.run("INSERT INTO inventory (product_id,quantity,reorder_level,store_id) VALUES (?,0,?,?)", [id, reorder_level||5, req.store_id]);
    
    const product = await db.get("SELECT * FROM products WHERE id=?", [id]);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    console.log(`[PUT /api/products/${req.params.id}] Received payload:`, JSON.stringify(req.body));
    const { sku, barcode, name, description, category_id, cost_price, selling_price, image_url, is_active, is_featured, is_raw_material, unit, net_weight } = req.body;
    const [product, inventory] = await Promise.all([
      db.get("SELECT * FROM products WHERE id=?", [req.params.id]),
      db.get("SELECT quantity FROM inventory WHERE product_id=?", [req.params.id])
    ]);

    if (!product) return next(new AppError("Product not found", 404));

    const finalSku = (sku !== undefined && sku !== null) ? String(sku).trim() : product.sku;
    const finalName = (name !== undefined && name !== null) ? String(name).trim() : product.name;
    const finalDescription = description !== undefined ? description : product.description;
    const finalCategoryId = category_id !== undefined ? category_id : product.category_id;
    const finalImageUrl = image_url !== undefined ? image_url : product.image_url;
    const finalIsActive = is_active !== undefined ? (is_active ? 1 : 0) : (product.is_active !== undefined ? product.is_active : 1);
    const finalIsFeatured = is_featured !== undefined ? (is_featured ? 1 : 0) : (product.is_featured !== undefined ? product.is_featured : 0);

    let isRawMatCategory = false;
    const targetCatId = finalCategoryId;
    if (targetCatId) {
      const catObj = await db.get("SELECT name FROM categories WHERE id=?", [targetCatId]);
      if (catObj && (catObj.name === 'วัตถุดิบ' || catObj.name.includes('วัตถุดิบ'))) {
        isRawMatCategory = true;
      }
    }

    let rawMatFlag;
    if (is_raw_material !== undefined && is_raw_material !== null) {
      rawMatFlag = (is_raw_material === 1 || is_raw_material === true || is_raw_material === '1' || is_raw_material === 'true') ? 1 : 0;
    } else if (isRawMatCategory) {
      rawMatFlag = 1;
    } else {
      rawMatFlag = product.is_raw_material ? 1 : 0;
    }
    const finalSellingPrice = selling_price !== undefined ? (rawMatFlag ? 0 : (parseFloat(selling_price) || 0)) : product.selling_price;
    const finalNetWeight = net_weight !== undefined ? (parseFloat(net_weight) || 1) : (product.net_weight || 1);
    
    let normalizedUnit = normalizeUnitKey(unit) || normalizeUnitKey(product.unit);
    if (rawMatFlag && (normalizedUnit === 'ชิ้น' || !normalizedUnit)) {
      normalizedUnit = 'g';
    } else if (!normalizedUnit) {
      normalizedUnit = 'ชิ้น';
    }
    const finalUnit = normalizedUnit;
    const finalBarcode = (barcode !== undefined) ? ((barcode && String(barcode).trim()) ? String(barcode).trim() : null) : product.barcode;

    console.log(`[PUT /api/products/${req.params.id}] Updating product "${finalName}" with unit="${finalUnit}" (rawInput="${unit}")`);
    const submittedCost = cost_price !== undefined ? normalizeCost(cost_price) : null;
    const currentQty = inventory ? parseInt(inventory.quantity, 10) : 0;
    let nextCostPrice = product.cost_price;
    let nextPendingCostPrice = product.pending_cost_price;

    if (submittedCost !== null) {
      if (currentQty > 0) {
        const currentCost = normalizeCost(product.cost_price);
        if (submittedCost !== currentCost) {
          nextPendingCostPrice = submittedCost;
        }
      } else {
        nextCostPrice = submittedCost;
        nextPendingCostPrice = null;
      }
    }

    if (nextCostPrice !== product.cost_price) {
      const oldCostStr = Number(product.cost_price).toFixed(2);
      const newCostStr = Number(nextCostPrice).toFixed(2);
      const remark = `แก้ไขต้นทุนสินค้า: ฿${oldCostStr} ➔ ฿${newCostStr} (แก้ไขข้อมูลสินค้า)`;
      
      await db.run(
        "INSERT INTO stock_transactions (id, product_id, user_id, store_id, type, quantity, remark) VALUES (?, ?, ?, ?, 'adjust', 0, ?)",
        [uuidv4(), req.params.id, req.user.id, req.store_id, remark]
      );
    }

    await db.run("UPDATE products SET sku=?,barcode=?,name=?,description=?,category_id=?,cost_price=?,pending_cost_price=?,selling_price=?,image_url=?,is_active=?,is_featured=?,is_raw_material=?,unit=?,net_weight=?,updated_at=datetime('now', '+7 hours') WHERE id=?",
      [finalSku, finalBarcode, finalName, finalDescription, finalCategoryId, nextCostPrice, nextPendingCostPrice, finalSellingPrice, finalImageUrl, finalIsActive, finalIsFeatured, rawMatFlag, finalUnit, finalNetWeight, req.params.id]);
    
    const updatedProduct = await db.get("SELECT * FROM products WHERE id=?", [req.params.id]);
    res.json({ success: true, data: updatedProduct });
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const product = await db.get("SELECT id,name FROM products WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!product) return next(new AppError("ไม่พบสินค้า", 404));
    await db.run("UPDATE products SET is_active=0, updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    res.json({ success: true, message: `ลบสินค้า "${product.name}" สำเร็จ` });
  } catch (err) { next(err); }
});

router.patch("/:id/name", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return next(new AppError("name is required", 400));
    const r = await db.run("UPDATE products SET name=?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [name, req.params.id, req.store_id]);
    if (r.changes === 0) return next(new AppError("ไม่พบสินค้า", 404));
    res.json({ success: true, data: await db.get("SELECT * FROM products WHERE id=? AND store_id=?", [name, req.params.id, req.store_id]) });
  } catch (err) { next(err); }
});

module.exports = router;
