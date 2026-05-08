const db = require('./src/database/dbHelper');

async function fix() {
  await db.init();
  
  await db.run(`CREATE TABLE IF NOT EXISTS debtors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('debtors table ensured');

  try { 
    await db.run('ALTER TABLE orders ADD COLUMN debtor_id TEXT'); 
    console.log('debtor_id column added'); 
  } catch(e) { 
    console.log('debtor_id already exists or error:', e.message); 
  }

  // Verify
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.map(t => t.name).join(', '));
  console.log('Fix completed on D1!');
  process.exit(0);
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
