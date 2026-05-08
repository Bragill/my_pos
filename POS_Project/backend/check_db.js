require('dotenv').config();
const db = require("./src/database/dbHelper");

async function check() {
  await db.init();
  const stores = await db.all("SELECT id, name, is_active FROM stores");
  console.log("Stores:", stores);
  
  for (const store of stores) {
    const products = await db.get("SELECT COUNT(*) as cnt FROM products WHERE store_id = ?", [store.id]);
    const orders = await db.get("SELECT COUNT(*) as cnt FROM orders WHERE store_id = ?", [store.id]);
    console.log(`Store: ${store.name} (${store.id}), Products: ${products.cnt}, Orders: ${orders.cnt}`);
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
