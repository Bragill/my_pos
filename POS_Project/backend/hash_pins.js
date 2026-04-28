require('dotenv').config();
const bcrypt = require('bcryptjs');
const { init, all, run } = require('./src/database/dbHelper');

async function migrate() {
  console.log('Starting PIN hashing migration...');
  await init();
  
  const users = all("SELECT id, username, pin_code FROM users WHERE pin_code IS NOT NULL");
  console.log(`Found ${users.length} users with PIN codes.`);
  
  let count = 0;
  for (const user of users) {
    // Check if it looks like it's already hashed (bcrypt hashes start with $2)
    if (user.pin_code && user.pin_code.startsWith('$2')) {
      console.log(`User ${user.username} already has a hashed PIN. Skipping.`);
      continue;
    }
    
    console.log(`Hashing PIN for user: ${user.username}`);
    const hashedPin = bcrypt.hashSync(String(user.pin_code), 12);
    run("UPDATE users SET pin_code = ? WHERE id = ?", [hashedPin, user.id]);
    count++;
  }
  
  console.log(`Migration complete. Hashed ${count} PIN codes.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});