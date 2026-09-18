require("dotenv").config();
const db = require("./dbHelper");

async function migrate() {
  console.log("Running migration on Cloudflare D1...");

  await db.run(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, promptpay_number TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS user_stores (user_id TEXT NOT NULL, store_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, PRIMARY KEY (user_id, store_id))`);
  await db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_code TEXT, full_name TEXT NOT NULL, role_id TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL, description TEXT, category_id TEXT, cost_price REAL NOT NULL DEFAULT 0, pending_cost_price REAL, selling_price REAL NOT NULL DEFAULT 0, image_url TEXT, is_active INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS inventory (product_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 5, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS stock_transactions (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, product_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, quantity INTEGER NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, member_code TEXT, name TEXT NOT NULL, phone TEXT, email TEXT, points INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, order_no TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, customer_id TEXT, debtor_name TEXT, debtor_id TEXT, sub_total REAL DEFAULT 0, discount REAL DEFAULT 0, tax REAL DEFAULT 0, total_amount REAL DEFAULT 0, payment_method TEXT, status TEXT DEFAULT 'pending', is_synced INTEGER DEFAULT 0, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, discount REAL DEFAULT 0, total_price REAL NOT NULL)`);
  await db.run(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, payment_type TEXT NOT NULL, amount REAL NOT NULL, reference_no TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, user_id TEXT NOT NULL, opening_amount REAL DEFAULT 0, closing_amount REAL, expected_amount REAL, difference REAL, status TEXT DEFAULT 'open', opened_at TEXT DEFAULT (datetime('now', '+7 hours')), closed_at TEXT)`);
  await db.run(`CREATE TABLE IF NOT EXISTS debtors (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS store_settings (id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);

  await db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, po_number TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, total_amount REAL DEFAULT 0, payment_method TEXT DEFAULT 'cash', bank_name TEXT, received_date TEXT NOT NULL, receipt_image_url TEXT NOT NULL, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (id TEXT PRIMARY KEY, po_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_cost_price REAL NOT NULL, total_price REAL NOT NULL)`);

  await db.run(`CREATE TABLE IF NOT EXISTS work_orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, wo_number TEXT NOT NULL UNIQUE, product_id TEXT NOT NULL, product_name TEXT NOT NULL, batch_count REAL NOT NULL DEFAULT 1, produced_yield REAL NOT NULL DEFAULT 0, yield_unit TEXT NOT NULL, total_cost REAL DEFAULT 0, user_id TEXT NOT NULL, user_name TEXT, remark TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS work_order_items (id TEXT PRIMARY KEY, wo_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, ingredient_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, cost REAL DEFAULT 0)`);
  
  await db.run(`CREATE TABLE IF NOT EXISTS line_settings (id TEXT PRIMARY KEY, store_id TEXT NOT NULL UNIQUE, channel_access_token TEXT, channel_secret TEXT, target_group_id TEXT, enable_daily_report INTEGER DEFAULT 1, daily_report_time TEXT DEFAULT '22:00', last_daily_report_sent_date TEXT, enable_approval_notifications INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS approval_requests (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, document_type TEXT NOT NULL, document_id TEXT NOT NULL, amount REAL DEFAULT 0, reason TEXT, requester_id TEXT, requester_name TEXT, status TEXT DEFAULT 'PENDING', approver_name TEXT, approver_line_user_id TEXT, responded_at TEXT, line_message_id TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), payload TEXT)`);
  await db.run(`CREATE TABLE IF NOT EXISTS device_security (id TEXT PRIMARY KEY, mac_address TEXT NOT NULL UNIQUE, ip_address TEXT, location TEXT, user_agent TEXT, device_name TEXT, last_user_name TEXT, failed_attempts INTEGER DEFAULT 0, status TEXT DEFAULT 'NORMAL', lock_until TEXT, locked_reason TEXT, is_bot INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now', '+7 hours')), updated_at TEXT DEFAULT (datetime('now', '+7 hours')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS user_biometrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mac_address TEXT, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, algorithm TEXT DEFAULT 'ES256', counter INTEGER DEFAULT 0, device_name TEXT, created_at TEXT DEFAULT (datetime('now', '+7 hours')), last_used_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

  try { await db.run("ALTER TABLE orders ADD COLUMN debtor_id TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stores ADD COLUMN promptpay_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stores ADD COLUMN promptpay_name TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN pending_cost_price REAL"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN recipe_name TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN recipe_yield REAL DEFAULT 1"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN portion_count REAL DEFAULT 1"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN portion_unit TEXT DEFAULT 'แก้ว'"); } catch(e) {}
  try { await db.run("ALTER TABLE stock_transactions ADD COLUMN po_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stock_transactions ADD COLUMN gr_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stock_transactions ADD COLUMN gi_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE stock_transactions ADD COLUMN receipt_url TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE ingredient_stock_transactions ADD COLUMN gr_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE ingredient_stock_transactions ADD COLUMN gi_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE ingredient_stock_transactions ADD COLUMN po_number TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE roles ADD COLUMN description TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE order_items ADD COLUMN recipe_deducted TEXT"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN deduct_recipe_on_sale INTEGER DEFAULT 0"); } catch(e) {}
  try { await db.run("ALTER TABLE products ADD COLUMN yield_unit TEXT"); } catch(e) {}
  try { await db.run("UPDATE products SET deduct_recipe_on_sale = 1 WHERE (deduct_recipe_on_sale IS NULL OR deduct_recipe_on_sale = 0) AND EXISTS (SELECT 1 FROM recipes r WHERE r.product_id = products.id)"); } catch(e) {}
  
  console.log("Migration completed!");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
