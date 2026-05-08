require("dotenv").config();
const db = require("./dbHelper");

async function migrate() {
  console.log("Running migration on Cloudflare D1...");

  await db.run(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, promptpay_number TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS user_stores (user_id TEXT NOT NULL, store_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, PRIMARY KEY (user_id, store_id))`);
  await db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_code TEXT, full_name TEXT NOT NULL, role_id TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL, description TEXT, category_id TEXT, cost_price REAL NOT NULL DEFAULT 0, selling_price REAL NOT NULL DEFAULT 0, image_url TEXT, is_active INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS inventory (product_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 5, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS stock_transactions (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, product_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, quantity INTEGER NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, member_code TEXT, name TEXT NOT NULL, phone TEXT, email TEXT, points INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, order_no TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, customer_id TEXT, debtor_name TEXT, debtor_id TEXT, sub_total REAL DEFAULT 0, discount REAL DEFAULT 0, tax REAL DEFAULT 0, total_amount REAL DEFAULT 0, payment_method TEXT, status TEXT DEFAULT 'pending', is_synced INTEGER DEFAULT 0, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, discount REAL DEFAULT 0, total_price REAL NOT NULL)`);
  await db.run(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, payment_type TEXT NOT NULL, amount REAL NOT NULL, reference_no TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, user_id TEXT NOT NULL, opening_amount REAL DEFAULT 0, closing_amount REAL, expected_amount REAL, difference REAL, status TEXT DEFAULT 'open', opened_at TEXT DEFAULT (datetime('now', '+7 hours')), closed_at TEXT)`);
  await db.run(`CREATE TABLE IF NOT EXISTS debtors (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS store_settings (id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  
  try { await db.run("ALTER TABLE orders ADD COLUMN debtor_id TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stores ADD COLUMN promptpay_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stores ADD COLUMN promptpay_name TEXT"); } catch(e) {}
  
  console.log("Migration completed!");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
