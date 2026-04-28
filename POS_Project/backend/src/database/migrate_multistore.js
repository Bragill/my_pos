require("dotenv").config();
const { getDb, saveDb } = require("./connection");

async function migrate() {
  console.log("Starting Multi-Store Migration (Offline)...");
  const db = await getDb();

  // 1. Create stores table
  db.run(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, tax_id TEXT, vat_rate REAL DEFAULT 7.00, receipt_header TEXT, receipt_footer TEXT, logo_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  console.log("Created stores table");

  // 2. Create user_stores table
  db.run(`CREATE TABLE IF NOT EXISTS user_stores (user_id TEXT NOT NULL, store_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, PRIMARY KEY (user_id, store_id))`);
  console.log("Created user_stores table");

  // 3. Create a default store
  const defaultStoreId = "store-1";
  const existingStoreSettings = db.exec("SELECT * FROM store_settings");
  if (existingStoreSettings.length > 0 && existingStoreSettings[0].values.length > 0) {
    const s = existingStoreSettings[0].values[0];
    db.run("INSERT OR IGNORE INTO stores (id, name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
      [defaultStoreId, s[1], s[2], s[3], s[4], s[5], s[6], s[7]]);
  } else {
    db.run("INSERT OR IGNORE INTO stores (id, name, vat_rate) VALUES (?, ?, ?)", [defaultStoreId, "My POS Store", 7.0]);
  }
  console.log("Ensured default store exists");

  // 4. Assign all existing users to the default store
  const users = db.exec("SELECT id FROM users");
  if (users.length > 0) {
    users[0].values.forEach(u => {
      db.run("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)", [u[0], defaultStoreId]);
      console.log(`Assigned user ${u[0]} to ${defaultStoreId}`);
    });
  }

  // 5. Add store_id to all relevant tables
  const tablesToUpdate = [
    'categories', 'products', 'inventory', 'stock_transactions', 
    'customers', 'orders', 'shifts', 'debtors'
  ];

  for (const table of tablesToUpdate) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      console.log(`Added store_id to ${table}`);
      db.run(`UPDATE ${table} SET store_id = ?`, [defaultStoreId]);
    } catch (err) {
      console.log(`Note: ${table} already updated or skipped: ${err.message}`);
    }
  }

  saveDb();
  console.log("Migration saved to disk.");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
