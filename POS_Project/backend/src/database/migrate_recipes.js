require("dotenv").config();
const db = require("./dbHelper");

async function migrateRecipes() {
  console.log("Starting Recipe Management Migration on Cloudflare D1...");

  // 1. Create ingredients table
  await db.run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      sku TEXT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'g',
      cost_per_unit REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 0,
      store_id TEXT REFERENCES stores(id),
      created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
      updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
    )
  `);
  console.log("✓ Table 'ingredients' created/verified.");

  // 2. Create recipes table
  await db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'g',
      store_id TEXT REFERENCES stores(id),
      created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
      updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
    )
  `);
  console.log("✓ Table 'recipes' created/verified.");

  // 3. Create ingredient_stock_transactions table
  await db.run(`
    CREATE TABLE IF NOT EXISTS ingredient_stock_transactions (
      id TEXT PRIMARY KEY,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      store_id TEXT REFERENCES stores(id),
      type TEXT NOT NULL CHECK (type IN ('receive', 'issue', 'adjust', 'sale', 'return')),
      quantity REAL NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
    )
  `);
  console.log("✓ Table 'ingredient_stock_transactions' created/verified.");

  console.log("Recipe Management Migration completed successfully!");
}

migrateRecipes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
