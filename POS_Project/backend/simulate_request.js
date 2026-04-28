const db = require("./src/database/dbHelper");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "pos_secret_key_2024"; // from .env

async function test() {
  await db.init();
  
  // Simulate req object
  const req = {
    headers: {
      authorization: "Bearer dummy",
      "x-store-id": "store-1"
    },
    user: { id: 'e6375492-0fc9-400c-9144-8e583f64261f', username: 'admin', role: 'admin' }
  };
  
  const res = {
    status: (code) => { console.log("Status:", code); return res; },
    json: (data) => { console.log("JSON:", data); return res; }
  };
  
  const next = (err) => {
    if (err) {
      console.log("Next called with error:", err.message, err.statusCode);
      if (err.stack) console.log(err.stack);
    } else {
      console.log("Next called with no error");
    }
  };

  console.log("--- Testing authenticate logic ---");
  try {
    let storeId = req.headers['x-store-id'];
    if (!storeId || storeId === 'null') {
      const firstStore = db.get("SELECT store_id FROM user_stores WHERE user_id = ? AND is_active = 1 LIMIT 1", [req.user.id]);
      storeId = firstStore?.store_id;
    }

    if (storeId) {
      if (req.user.role !== 'admin') {
        const hasAccess = db.get("SELECT 1 FROM user_stores WHERE user_id = ? AND store_id = ? AND is_active = 1", [req.user.id, storeId]);
        if (!hasAccess) {
          console.log("Access denied");
        }
      }
      req.store_id = storeId;
    }
    console.log("Authenticated. store_id:", req.store_id);
  } catch (err) {
    console.error("Auth logic failed:", err);
  }

  console.log("--- Testing /stores/current logic ---");
  try {
    const store = db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    if (!store) {
        console.log("Store not found (404)");
    } else {
        console.log("Store found:", store.name);
    }
  } catch (err) {
    console.error("/stores/current logic failed:", err);
  }

  process.exit(0);
}

test();
