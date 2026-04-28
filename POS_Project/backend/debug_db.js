const db = require("./src/database/dbHelper");

async function check() {
  await db.init();
  try {
    const users = db.all("SELECT id, username FROM users");
    console.log("Users:", users);
    
    const userStores = db.all("SELECT * FROM user_stores");
    console.log("User-Store Assignments:", userStores);
    
    const stores = db.all("SELECT * FROM stores");
    console.log("Stores:", stores);
  } catch (err) {
    console.error("Check failed:", err);
  }
  process.exit(0);
}

check();
