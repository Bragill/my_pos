const db = require("./src/database/dbHelper");

async function check() {
  await db.init();
  try {
    const info = db.getDatabase().prepare("PRAGMA table_info(user_stores)").all();
    console.log("user_stores schema:", info);
    
    const storesInfo = db.getDatabase().prepare("PRAGMA table_info(stores)").all();
    console.log("stores schema:", storesInfo);
  } catch (err) {
    console.error("Check failed:", err);
  }
  process.exit(0);
}

check();
