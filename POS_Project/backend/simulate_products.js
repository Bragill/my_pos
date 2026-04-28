const db = require("./src/database/dbHelper");

async function test() {
  await db.init();
  
  const req = {
    query: {},
    store_id: "store-1"
  };

  console.log("--- Testing /products logic ---");
  try {
    const { search, category_id, page = 1, limit = 50, featured } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE p.is_active = 1 AND p.store_id = ?";
    const params = [req.store_id];
    
    console.log("Querying count...");
    const countRow = db.get("SELECT COUNT(*) as cnt FROM products p " + where, params);
    console.log("Count:", countRow.cnt);

    const selectParams = [...params, parseInt(limit), parseInt(offset)];
    console.log("Querying rows with params:", selectParams);
    const rows = db.all("SELECT p.*, c.name as category_name, COALESCE(i.quantity,0) as stock_quantity FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN inventory i ON p.id=i.product_id " + where + " ORDER BY p.is_featured DESC, p.name ASC LIMIT ? OFFSET ?", selectParams);
    console.log("Rows found:", rows.length);
  } catch (err) {
    console.error("/products logic failed:", err);
  }

  process.exit(0);
}

test();
