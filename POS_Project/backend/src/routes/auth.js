const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database/dbHelper");
const { AppError } = require("../middleware/errorHandler");
const { authenticate } = require("../middleware/auth");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
  process.exit(1);
}
const DEFAULT_SECRET = JWT_SECRET || "pos_secret_key_dev_only";

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await db.get("SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ? AND u.status = 'active'", [username]);
    
    if (!user) {
      console.warn(`Login failed: user ${username} not found or inactive`);
      return next(new AppError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401));
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.warn(`Login failed: wrong password for ${username}`);
      return next(new AppError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401));
    }
    
    // Get assigned stores
    let stores = [];
    if (user.role_name === 'admin') {
      stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
    } else {
      stores = await db.all("SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1 AND s.is_active = 1", [user.id]);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_name, permissions: JSON.parse(user.permissions) }, 
      DEFAULT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    console.log(`Login successful for ${user.username}, stores count: ${stores.length}`);
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name }, stores } });
  } catch (err) { 
    console.error("Detailed Login Error:", err);
    next(err); 
  }
});

router.post("/pin-login", async (req, res, next) => {
  try {
    const { pin } = req.body;
    console.log("Attempting PIN login with:", pin, "type:", typeof pin);
    const pinStr = String(pin);
    
    // Since PINs will be hashed, we can't search by plain PIN anymore.
    const users = await db.all("SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.status = 'active' AND u.pin_code IS NOT NULL");
    
    console.log(`Checking ${users.length} users with PINs`);
    const results = await Promise.all(
      users.map(user => bcrypt.compare(pinStr, user.pin_code).then(match => ({ user, match })))
    );
    const matchedUser = results.find(r => r.match)?.user ?? null;
    if (matchedUser) console.log(`Matched user: ${matchedUser.username}`);

    if (!matchedUser) {
      console.warn(`PIN Login failed: wrong pin`);
      return next(new AppError("PIN ไม่ถูกต้อง", 401));
    }
    
    // Get assigned stores
    let stores = [];
    if (matchedUser.role_name === 'admin') {
      stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
    } else {
      stores = await db.all("SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1 AND s.is_active = 1", [matchedUser.id]);
    }

    const token = jwt.sign(
      { id: matchedUser.id, username: matchedUser.username, role: matchedUser.role_name, permissions: JSON.parse(matchedUser.permissions) }, 
      DEFAULT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    console.log(`PIN Login successful for ${matchedUser.username}, stores count: ${stores.length}`);
    res.json({ success: true, data: { token, user: { id: matchedUser.id, username: matchedUser.username, fullName: matchedUser.full_name, role: matchedUser.role_name }, stores } });
  } catch (err) { 
    console.error("Detailed PIN Login Error:", err);
    next(err); 
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.get("SELECT u.id, u.username, u.full_name, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?", [req.user.id]);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

module.exports = router;