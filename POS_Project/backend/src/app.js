const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve local uploads when directory exists (local development)
try {
  if (typeof __dirname !== 'undefined') {
    const uploadsPath = path.join(__dirname, '../uploads');
    app.use('/uploads', express.static(uploadsPath));
  }
} catch {}

// Rate limiting (enabled in Node.js; skipped in Cloudflare Workers where global setInterval is disallowed and WAF handles rate limiting)
const isCloudflareWorker = typeof WebSocketPair !== 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Cloudflare'));
if (!isCloudflareWorker) {
  try {
    const rateLimit = require('express-rate-limit');
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/api/', limiter);
  } catch {}
}

// Route mounts
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/users', require('./routes/users'));
app.use('/api/debtors', require('./routes/debtors'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/ocr', require('./modules/ocr/ocrRoutes'));
app.use('/api/ingredients', require('./routes/ingredients'));
app.use('/api/recipes', require('./routes/recipes'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  });
});

app.all('/api/internal/init-d1', async (req, res, next) => {
  try {
    const db = require('./database/dbHelper');
    const bcrypt = require('bcryptjs');

    await db.run(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, promptpay_number TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS user_stores (user_id TEXT NOT NULL, store_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, PRIMARY KEY (user_id, store_id))`);
    await db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_code TEXT, full_name TEXT NOT NULL, role_id TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, is_raw_material INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL, description TEXT, category_id TEXT, cost_price REAL NOT NULL DEFAULT 0, pending_cost_price REAL, selling_price REAL NOT NULL DEFAULT 0, image_url TEXT, is_active INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0, is_raw_material INTEGER DEFAULT 0, net_weight REAL, unit TEXT DEFAULT 'ชิ้น', shelf_life_days INTEGER, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    try { await db.run("ALTER TABLE products ADD COLUMN is_raw_material INTEGER DEFAULT 0"); } catch (_) {}
    try { await db.run("ALTER TABLE products ADD COLUMN net_weight REAL"); } catch (_) {}
    await db.run(`CREATE TABLE IF NOT EXISTS inventory (product_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 5, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS stock_transactions (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, product_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, quantity REAL NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, member_code TEXT, name TEXT NOT NULL, phone TEXT, email TEXT, points INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, order_no TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, customer_id TEXT, debtor_name TEXT, debtor_id TEXT, sub_total REAL DEFAULT 0, discount REAL DEFAULT 0, tax REAL DEFAULT 0, total_amount REAL DEFAULT 0, payment_method TEXT, status TEXT DEFAULT 'pending', is_synced INTEGER DEFAULT 0, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity REAL NOT NULL, unit_price REAL NOT NULL, discount REAL DEFAULT 0, total_price REAL NOT NULL)`);
    await db.run(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, payment_type TEXT NOT NULL, amount REAL NOT NULL, reference_no TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, user_id TEXT NOT NULL, opening_amount REAL DEFAULT 0, closing_amount REAL, expected_amount REAL, difference REAL, status TEXT DEFAULT 'open', opened_at TEXT DEFAULT (datetime('now', '+7 hours')), closed_at TEXT)`);
    await db.run(`CREATE TABLE IF NOT EXISTS debtors (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS store_settings (id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, po_number TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, total_amount REAL DEFAULT 0, payment_method TEXT DEFAULT 'cash', bank_name TEXT, received_date TEXT NOT NULL, receipt_image_url TEXT NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (id TEXT PRIMARY KEY, po_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity REAL NOT NULL, unit_cost_price REAL NOT NULL, total_price REAL NOT NULL)`);
    await db.run(`CREATE TABLE IF NOT EXISTS product_batches (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, store_id TEXT NOT NULL, wo_id TEXT, wo_number TEXT, qty_produced REAL NOT NULL, qty_remaining REAL NOT NULL, unit TEXT NOT NULL, produced_at TEXT NOT NULL, expiry_date TEXT, status TEXT NOT NULL DEFAULT 'active', expired_at TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, sku TEXT, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'g', cost_per_unit REAL NOT NULL DEFAULT 0, quantity REAL NOT NULL DEFAULT 0, reorder_level REAL NOT NULL DEFAULT 0, store_id TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'g', store_id TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS ingredient_stock_transactions (id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL, user_id TEXT, store_id TEXT, type TEXT NOT NULL, quantity REAL NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS ocr_receipts (id TEXT PRIMARY KEY, store_id TEXT, user_id TEXT, image_url TEXT NOT NULL, storage_key TEXT NOT NULL, status TEXT DEFAULT 'pending', raw_ocr_data TEXT, structured_data TEXT, total_amount REAL, vendor_name TEXT, receipt_date TEXT, error_message TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
    await db.run(`CREATE TABLE IF NOT EXISTS ocr_receipt_items (id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, product_id TEXT, raw_name TEXT NOT NULL, matched_name TEXT, quantity REAL DEFAULT 1, unit_price REAL, total_price REAL, is_stock_updated INTEGER DEFAULT 0)`);

    await db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES ('role-admin', 'admin', '{\"all\":true}')");
    await db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES ('role-manager', 'manager', '{\"reports\":true,\"inventory\":true}')");
    await db.run("INSERT OR IGNORE INTO roles (id, name, permissions) VALUES ('role-cashier', 'cashier', '{\"pos\":true,\"shift\":true}')");

    const hash = await bcrypt.hash("admin1234", 10);
    const pin = await bcrypt.hash("0000", 10);
    await db.run("INSERT OR IGNORE INTO users (id, username, password_hash, pin_code, full_name, role_id) VALUES ('usr-admin', 'admin', ?, ?, 'Admin User', 'role-admin')", [hash, pin]);

    await db.run("INSERT OR IGNORE INTO stores (id, name, vat_rate) VALUES ('store-1', 'ร้านสาขาหลัก', 7.0)");
    await db.run("INSERT OR IGNORE INTO stores (id, name, vat_rate) VALUES ('store-2', 'ร้านน้ำเต้าหู้', 7.0)");
    await db.run("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES ('usr-admin', 'store-1')");
    await db.run("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES ('usr-admin', 'store-2')");

    const catId1 = 'cat-bev';
    const catId2 = 'cat-food';
    await db.run("INSERT OR IGNORE INTO categories (id, store_id, name) VALUES (?, 'store-1', 'เครื่องดื่ม')", [catId1]);
    await db.run("INSERT OR IGNORE INTO categories (id, store_id, name) VALUES (?, 'store-1', 'อาหาร')", [catId2]);

    const prodId1 = 'prod-water';
    const prodId2 = 'prod-coke';
    await db.run("INSERT OR IGNORE INTO products (id, store_id, sku, barcode, name, category_id, cost_price, selling_price, is_active) VALUES (?, 'store-1', 'BEV001', '8850001', 'น้ำดื่ม 600ml', ?, 5, 10, 1)", [prodId1, catId1]);
    await db.run("INSERT OR IGNORE INTO products (id, store_id, sku, barcode, name, category_id, cost_price, selling_price, is_active) VALUES (?, 'store-1', 'BEV002', '8850002', 'โค้ก 325ml', ?, 10, 18, 1)", [prodId2, catId1]);

    await db.run("INSERT OR IGNORE INTO inventory (product_id, store_id, quantity, reorder_level) VALUES (?, 'store-1', 100, 10)", [prodId1]);
    await db.run("INSERT OR IGNORE INTO inventory (product_id, store_id, quantity, reorder_level) VALUES (?, 'store-1', 50, 10)", [prodId2]);

    res.json({ success: true, message: 'D1 schema and seed initialized successfully!' });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

module.exports = app;
