const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "pos_system.db");

let db = null;

async function getDb() {
  if (db) return db;
  
  db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  // Ensure schema is up to date (safe to run every startup)
  db.exec(`CREATE TABLE IF NOT EXISTS debtors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, note TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`);

  try { db.exec("ALTER TABLE orders ADD COLUMN debtor_name TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN debtor_id TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE stores ADD COLUMN promptpay_number TEXT"); } catch(e) {}
  try { db.exec("ALTER TABLE stores ADD COLUMN promptpay_name TEXT"); } catch(e) {}

  return db;
}

// Stub for backward compatibility if needed, though better-sqlite3 auto-saves
function saveDb() {}

module.exports = { getDb, saveDb };