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
    const { search, category_id, page = 1, limit = 50, featured } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE p.is_active = 1 AND p.store_id = ?";
    const params = [req.store_id];
    if (search) { where += " AND (p.name LIKE ? OR p.barcode = ? OR p.sku LIKE ?)"; params.push("%"+search+"%", search, "%"+search+"%"); }
    if (category_id) { where += " AND p.category_id = ?"; params.push(category_id); }
    if (featured === "true") { where += " AND p.is_featured = 1"; }
    const countRow = await db.get("SELECT COUNT(*) as cnt FROM products p " + where, params);
    params.push(parseInt(limit), parseInt(offset));
    const rows = await db.all("SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id " + where + " ORDER BY p.is_featured DESC, p.name ASC LIMIT ? OFFSET ?", params);
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

router.post("/", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { sku, barcode, name, description, category_id, cost_price, selling_price, image_url, is_featured, reorder_level } = req.body;
    if (!sku) return next(new AppError("SKU is required", 400));
    // Fallback to "อื่นๆ" category if none selected
    let resolvedCategoryId = category_id || null;
    if (!resolvedCategoryId) {
      const other = await db.get("SELECT id FROM categories WHERE name='อื่นๆ' AND store_id=? LIMIT 1", [req.store_id]);
      if (other) resolvedCategoryId = other.id;
    }
    const id = uuidv4();
    await db.run("INSERT INTO products (id,sku,barcode,name,description,category_id,cost_price,selling_price,image_url,is_featured,store_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, sku, barcode||null, name, description||null, resolvedCategoryId, cost_price, selling_price, image_url||null, is_featured?1:0, req.store_id]);
    await db.run("INSERT INTO inventory (product_id,quantity,reorder_level,store_id) VALUES (?,0,?,?)", [id, reorder_level||5, req.store_id]);
    const product = await db.get("SELECT * FROM products WHERE id=? AND store_id=?", [id, req.store_id]);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const { sku, barcode, name, description, category_id, cost_price, selling_price, image_url, is_active, is_featured } = req.body;
    const [product, inventory] = await Promise.all([
      db.get("SELECT cost_price,pending_cost_price FROM products WHERE id=? AND store_id=?", [req.params.id, req.store_id]),
      db.get("SELECT quantity FROM inventory WHERE product_id=? AND store_id=?", [req.params.id, req.store_id])
    ]);

    if (!product) return next(new AppError("Product not found", 404));

    const submittedCost = normalizeCost(cost_price);
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

    await db.run("UPDATE products SET sku=?,barcode=?,name=?,description=?,category_id=?,cost_price=?,pending_cost_price=?,selling_price=?,image_url=?,is_active=?,is_featured=?,updated_at=datetime('now', '+7 hours') WHERE id=? AND store_id=?", [sku, barcode, name, description, category_id, nextCostPrice, nextPendingCostPrice, selling_price, image_url, is_active?1:0, is_featured?1:0, req.params.id, req.store_id]);
    const updatedProduct = await db.get("SELECT * FROM products WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    res.json({ success: true, data: updatedProduct });
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, authorize("admin","manager"), async (req, res, next) => {
  try {
    const product = await db.get("SELECT id,name FROM products WHERE id=? AND store_id=?", [req.params.id, req.store_id]);
    if (!product) return next(new AppError("ไม่พบสินค้า", 404));
    // Soft delete — mark inactive so history is preserved
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
    res.json({ success: true, data: await db.get("SELECT * FROM products WHERE id=? AND store_id=?", [req.params.id, req.store_id]) });
  } catch (err) { next(err); }
});

module.exports = router;
