require('dotenv').config();
const db = require('./src/database/dbHelper');
const bcrypt = require('bcryptjs');

async function check() {
  try {
    const users = await db.all("SELECT u.id, u.username, u.pin_code, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.status = 'active'");
    console.log(`Users found: ${users.length}`);
    
    for (const u of users) {
      if (u.pin_code) {
        const match = await bcrypt.compare('0000', u.pin_code);
        console.log(`User: ${u.username}, Role: ${u.role_name}, PIN Match: ${match}`);
        
        if (match) {
          // If match, check their store assignments
          let stores = [];
          if (u.role_name === 'admin') {
            stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
          } else {
            stores = await db.all("SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1", [u.id]);
          }
          console.log(`Available Stores for ${u.username}:`, stores);
          
          // Check user_stores specifically for this user
          const assignments = await db.all("SELECT * FROM user_stores WHERE user_id = ?", [u.id]);
          console.log(`Direct user_stores assignments for ${u.username}:`, assignments);
        }
      } else {
        console.log(`User: ${u.username} has no PIN set`);
      }
    }
    
    // Check roles and permissions
    const roles = await db.all("SELECT * FROM roles");
    for (const r of roles) {
        try {
            JSON.parse(r.permissions);
            console.log(`Role: ${r.name} has valid permissions JSON`);
        } catch (e) {
            console.error(`Role: ${r.name} HAS INVALID PERMISSIONS JSON: ${r.permissions}`);
        }
    }

  } catch (err) {
    console.error("Diagnostic Error:", err);
  }
  process.exit(0);
}

check();
