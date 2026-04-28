const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'pos_system.db');

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  db.run(`CREATE TABLE IF NOT EXISTS debtors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('debtors table created');

  try { db.run('ALTER TABLE orders ADD COLUMN debtor_id TEXT'); console.log('debtor_id column added'); }
  catch(e) { console.log('debtor_id already exists:', e.message); }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  // Verify
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(r=>r[0]);
  const orderCols = db.exec('PRAGMA table_info(orders)')[0].values.map(r=>r[1]);
  console.log('Tables:', tables.join(', '));
  console.log('Orders cols:', orderCols.join(', '));
  console.log('DB saved successfully!');
});
