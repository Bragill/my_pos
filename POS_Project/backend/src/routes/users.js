const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// UPDATE own profile
router.put("/me", authenticate, async (req, res, next) => {
  try {
    const { full_name, current_password, password } = req.body;
    const user = await db.get("SELECT * FROM users WHERE id=?", [req.user.id]);
    if (!user) return next(new AppError("ไม่พบผู้ใช้งาน", 404));
    if (password) {
      if (!current_password) return next(new AppError("กรุณากรอกรหัสผ่านปัจจุบัน", 400));
      const match = await bcrypt.compare(current_password, user.password_hash);
      if (!match) return next(new AppError("รหัสผ่านปัจจุบันไม่ถูกต้อง", 400));
      const hash = await bcrypt.hash(password, 12);
      await db.run("UPDATE users SET full_name=?, password_hash=?, updated_at=datetime('now', '+7 hours') WHERE id=?", [full_name, hash, req.user.id]);
    } else {
      await db.run("UPDATE users SET full_name=?, updated_at=datetime('now', '+7 hours') WHERE id=?", [full_name, req.user.id]);
    }
    const updated = await db.get("SELECT id, username, full_name, status FROM users WHERE id=?", [req.user.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET all users
router.get("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const users = await db.all("SELECT u.id, u.username, u.full_name, u.pin_code, u.status, r.name as role_name, u.created_at FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC");
    
    // Add assigned stores to each user in parallel
    await Promise.all(users.map(async (u) => {
      const stores = await db.all("SELECT s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ?", [u.id]);
      u.assigned_stores = stores.map(s => s.name);
    }));
    
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// GET all roles
router.get("/roles", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    let roles = [];
    try {
      roles = await db.all(`
        SELECT r.id, r.name, r.permissions, r.description, r.created_at,
               COUNT(u.id) as user_count
        FROM roles r
        LEFT JOIN users u ON r.id = u.role_id
        GROUP BY r.id, r.name, r.permissions, r.description, r.created_at
        ORDER BY r.created_at ASC
      `);
    } catch (err) {
      console.warn("Retrying GET /roles with schema fix:", err.message);
      try {
        await db.run("ALTER TABLE roles ADD COLUMN description TEXT");
        roles = await db.all(`
          SELECT r.id, r.name, r.permissions, r.description, r.created_at,
                 COUNT(u.id) as user_count
          FROM roles r
          LEFT JOIN users u ON r.id = u.role_id
          GROUP BY r.id, r.name, r.permissions, r.description, r.created_at
          ORDER BY r.created_at ASC
        `);
      } catch (err2) {
        roles = await db.all(`
          SELECT r.id, r.name, r.permissions, '' as description, r.created_at,
                 COUNT(u.id) as user_count
          FROM roles r
          LEFT JOIN users u ON r.id = u.role_id
          GROUP BY r.id, r.name, r.permissions, r.created_at
          ORDER BY r.created_at ASC
        `);
      }
    }
    
    const formattedRoles = roles.map(r => {
      let perms = {};
      try { perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || {}); } catch(e) {}
      return {
        ...r,
        description: r.description || '',
        permissions: perms,
        user_count: Number(r.user_count || 0)
      };
    });

    res.json({ success: true, data: formattedRoles });
  } catch (err) { next(err); }
});

// CREATE role
router.post("/roles", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || !name.trim()) return next(new AppError("กรุณาระบุชื่อบทบาท", 400));
    
    const trimmedName = name.trim();
    const existing = await db.get("SELECT id FROM roles WHERE LOWER(name) = LOWER(?)", [trimmedName]);
    if (existing) return next(new AppError(`บทบาท "${trimmedName}" มีอยู่ในระบบแล้ว`, 400));

    const id = uuidv4();
    const permString = typeof permissions === 'object' ? JSON.stringify(permissions) : (permissions || '{}');
    
    try {
      await db.run(
        "INSERT INTO roles (id, name, description, permissions) VALUES (?,?,?,?)",
        [id, trimmedName, description || null, permString]
      );
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('description')) {
        try { await db.run("ALTER TABLE roles ADD COLUMN description TEXT"); } catch(e) {}
        await db.run(
          "INSERT INTO roles (id, name, description, permissions) VALUES (?,?,?,?)",
          [id, trimmedName, description || null, permString]
        );
      } else {
        throw insertErr;
      }
    }

    const created = await db.get("SELECT * FROM roles WHERE id = ?", [id]);
    let perms = {};
    try { perms = JSON.parse(created.permissions); } catch(e) {}
    res.status(201).json({ success: true, data: { ...created, description: created.description || '', permissions: perms, user_count: 0 } });
  } catch (err) { next(err); }
});

// UPDATE role
router.put("/roles/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    const role = await db.get("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    if (!role) return next(new AppError("ไม่พบบทบาทที่ต้องการแก้ไข", 404));

    const isSystemAdmin = role.name === 'admin';
    const newName = isSystemAdmin ? 'admin' : (name ? name.trim() : role.name);
    
    if (!isSystemAdmin && newName.toLowerCase() !== role.name.toLowerCase()) {
      const existing = await db.get("SELECT id FROM roles WHERE LOWER(name) = LOWER(?) AND id != ?", [newName, req.params.id]);
      if (existing) return next(new AppError("ชื่อบทบาทนี้มีอยู่ในระบบแล้ว", 400));
    }

    const permString = typeof permissions === 'object' ? JSON.stringify(permissions) : (permissions || '{}');
    await db.run(
      "UPDATE roles SET name=?, description=?, permissions=?, updated_at=datetime('now', '+7 hours') WHERE id=?",
      [newName, description || null, permString, req.params.id]
    );

    const updated = await db.get("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    const userCountRes = await db.get("SELECT COUNT(id) as count FROM users WHERE role_id = ?", [req.params.id]);
    let perms = {};
    try { perms = JSON.parse(updated.permissions); } catch(e) {}
    res.json({ success: true, data: { ...updated, permissions: perms, user_count: Number(userCountRes?.count || 0) } });
  } catch (err) { next(err); }
});

// DELETE role
router.delete("/roles/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const role = await db.get("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    if (!role) return next(new AppError("ไม่พบบทบาทที่ต้องการลบ", 404));

    if (role.name === 'admin') {
      return next(new AppError("ไม่สามารถลบบทบาทผู้ดูแลระบบสูงสุด (admin) ได้", 400));
    }

    const usersAssigned = await db.get("SELECT COUNT(id) as count FROM users WHERE role_id = ?", [req.params.id]);
    if (usersAssigned && usersAssigned.count > 0) {
      return next(new AppError(`ไม่สามารถลบบทบาทนี้ได้ เนื่องจากมีผู้ใช้งานใช้บทบาทนี้อยู่ ${usersAssigned.count} คน`, 400));
    }

    await db.run("DELETE FROM roles WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "ลบบทบาทสำเร็จ" });
  } catch (err) { next(err); }
});

// CREATE user
router.post("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { username, password, pin_code, full_name, role_id } = req.body;
    if (!username || !password || !full_name || !role_id) return next(new AppError("กรุณากรอกข้อมูลให้ครบถ้วน", 400));
    const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) return next(new AppError("ชื่อผู้ใช้นี้มีอยู่แล้ว", 400));
    const id = uuidv4();
    const hash = await bcrypt.hash(password, 12);
    // Hash PIN if present
    let hashedPin = null;
    if (pin_code) {
        hashedPin = await bcrypt.hash(String(pin_code), 10);
    }
    await db.run("INSERT INTO users (id, username, password_hash, pin_code, full_name, role_id) VALUES (?,?,?,?,?,?)", [id, username, hash, hashedPin, full_name, role_id]);
    const user = await db.get("SELECT u.id, u.username, u.full_name, u.pin_code, u.status, r.name as role_name, u.created_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?", [id]);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

// UPDATE user
router.put("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { full_name, pin_code, role_id, status, password } = req.body;
    const user = await db.get("SELECT id FROM users WHERE id = ?", [req.params.id]);
    if (!user) return next(new AppError("ไม่พบผู้ใช้งาน", 404));
    
    let hashedPin = undefined;
    if (pin_code !== undefined) {
        hashedPin = pin_code ? await bcrypt.hash(String(pin_code), 10) : null;
    }

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await db.run("UPDATE users SET full_name=?, pin_code=COALESCE(?, pin_code), role_id=?, status=?, password_hash=?, updated_at=datetime('now', '+7 hours') WHERE id=?", [full_name, hashedPin, role_id, status, hash, req.params.id]);
    } else {
      await db.run("UPDATE users SET full_name=?, pin_code=COALESCE(?, pin_code), role_id=?, status=?, updated_at=datetime('now', '+7 hours') WHERE id=?", [full_name, hashedPin, role_id, status, req.params.id]);
    }
    const updated = await db.get("SELECT u.id, u.username, u.full_name, u.pin_code, u.status, r.name as role_name, u.created_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?", [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE user
router.delete("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    if (req.user.id === req.params.id) return next(new AppError("ไม่สามารถลบบัญชีตัวเองได้", 400));
    const user = await db.get("SELECT id FROM users WHERE id = ?", [req.params.id]);
    if (!user) return next(new AppError("ไม่พบผู้ใช้งาน", 404));
    await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "ลบผู้ใช้งานสำเร็จ" });
  } catch (err) { next(err); }
});

module.exports = router;
