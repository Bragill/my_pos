const bcrypt = require('bcryptjs');
const db = require('./src/database/dbHelper');

async function reset() {
    await db.init();
    const pin = "0000";
    const hash = bcrypt.hashSync(pin, 12);
    console.log("New hash for 0000:", hash);
    
    db.run("UPDATE users SET pin_code = ? WHERE username = 'admin'", [hash]);
    console.log("Admin PIN reset to 0000");
    
    // Verify
    const user = db.get("SELECT pin_code FROM users WHERE username = 'admin'");
    const match = await bcrypt.compare("0000", user.pin_code);
    console.log("Verification match:", match);
    process.exit(0);
}

reset();
