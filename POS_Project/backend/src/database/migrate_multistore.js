require("dotenv").config();
const db = require("./dbHelper");

async function migrate() {
  console.log("Starting Multi-Store Migration on Cloudflare D1...");

  // 1. Create stores table
  await db.run(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  console.log("Created stores table");

  // 2. Create user_stores table
  await db.run(`CREATE TABLE IF NOT EXISTS user_stores (user_id TEXT NOT NULL, store_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, PRIMARY KEY (user_id, store_id))`);
  console.log("Created user_stores table");

  // 3. Create a default store
  const defaultStoreId = "store-1";
  const s = await db.get("SELECT * FROM store_settings LIMIT 1");
  if (s) {
    await db.run("INSERT OR IGNORE INTO stores (id, name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
      [defaultStoreId, s.store_name, s.address, s.phone, s.tax_id, s.vat_rate, s.receipt_header, s.receipt_footer]);
  } else {
    await db.run("INSERT OR IGNORE INTO stores (id, name, vat_rate) VALUES (?, ?, ?)", [defaultStoreId, "My POS Store", 7.0]);
  }
  console.log("Ensured default store exists");

  // 4. Assign all existing users to the default store
  const users = await db.all("SELECT id FROM users");
  for (const u of users) {
    await db.run("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)", [u.id, defaultStoreId]);
    console.log(`Assigned user ${u.id} to ${defaultStoreId}`);
  }

  // 5. Add store_id to all relevant tables
  const tablesToUpdate = [
    'categories', 'products', 'inventory', 'stock_transactions', 
    'customers', 'orders', 'shifts', 'debtors'
  ];

  for (const table of tablesToUpdate) {
    try {
      await db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      console.log(`Added store_id to ${table}`);
      await db.run(`UPDATE ${table} SET store_id = ?`, [defaultStoreId]);
    } catch (err) {
      console.log(`Note: ${table} already updated or skipped: ${err.message}`);
    }
  }

  console.log("Migration completed on D1.");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
