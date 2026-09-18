const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const getJwtSecret = () => process.env.JWT_SECRET || 'pos_secret_key_dev_only';

// Helper to generate base64url random bytes
function generateChallenge(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function parseLockTimestamp(rawDate) {
  if (!rawDate) return null;
  if (typeof rawDate === 'number') return rawDate;
  let str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str + 'Z';
  }
  const t = new Date(str).getTime();
  return isNaN(t) ? null : t;
}

async function checkDeviceLock(mac_address) {
  if (!mac_address) return null;
  let device = await db.get('SELECT * FROM device_security WHERE mac_address = ?', [mac_address]);
  if (!device) {
    const id = uuidv4();
    await db.run(
      `INSERT INTO device_security (id, mac_address, failed_attempts, status, created_at, updated_at)
       VALUES (?, ?, 0, 'NORMAL', datetime('now', '+7 hours'), datetime('now', '+7 hours'))`,
      [id, mac_address]
    );
    device = await db.get('SELECT * FROM device_security WHERE mac_address = ?', [mac_address]);
  }

  if (device.status === 'BLACKLISTED') {
    throw new AppError('อุปกรณ์นี้ถูกระงับการใช้งานถาวร (Blacklisted)', 403);
  }
  if (device.status === 'LOCKED_PERMANENT') {
    throw new AppError('อุปกรณ์นี้ถูกระงับการเข้าใช้งานเนื่องจากความปลอดภัย กรุณาติดต่อผู้จัดการ', 403);
  }
  if (device.status === 'LOCKED_TEMP' && device.lock_until) {
    const lockUntil = parseLockTimestamp(device.lock_until);
    const now = Date.now();
    if (lockUntil && lockUntil > now) {
      const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      throw new AppError(`อุปกรณ์นี้อยู่ในช่วงหน่วงเวลาชั่วคราว กรุณารออีกประมาณ ${remainingMinutes} นาทีก่อนลองใหม่`, 429, {
        lock_until: device.lock_until,
        remaining_seconds: remainingSeconds,
        status: 'LOCKED_TEMP'
      });
    } else {
      // Lock expired, restore to NORMAL
      await db.run("UPDATE device_security SET status = 'NORMAL', lock_until = NULL WHERE mac_address = ?", [mac_address]);
      device.status = 'NORMAL';
      device.lock_until = null;
    }
  }
  return device;
}

// ─── 1. Generate Registration Options (Admin / Manager only) ─────
router.post('/register-options', authenticate, async (req, res, next) => {
  try {
    const userRole = req.user.role;
    if (userRole !== 'admin' && userRole !== 'manager') {
      return next(new AppError('เฉพาะผู้จัดการหรือผู้ดูแลระบบเท่านั้นที่สามารถลงทะเบียนชีวมาตรได้', 403));
    }

    const challenge = generateChallenge(32);
    
    // Relying Party identifier — handles both local dev and production workers
    const host = req.get('host') || 'localhost';
    const rpId = host.split(':')[0];

    const options = {
      challenge,
      rp: {
        name: 'POS System',
        id: rpId
      },
      user: {
        id: Buffer.from(req.user.id).toString('base64url'),
        name: req.user.username,
        displayName: req.user.fullName || req.user.username
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256 (ECDSA P-256)
        { type: 'public-key', alg: -257 }  // RS256 (RSA 2048)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Built-in: TouchID, FaceID, Windows Hello, Android Biometrics
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };

    res.json({
      success: true,
      data: options
    });
  } catch (err) {
    next(err);
  }
});

// ─── 2. Verify and Save Registration (Admin / Manager only) ───────
router.post('/register-verify', authenticate, async (req, res, next) => {
  try {
    const userRole = req.user.role;
    if (userRole !== 'admin' && userRole !== 'manager') {
      return next(new AppError('เฉพาะผู้จัดการหรือผู้ดูแลระบบเท่านั้นที่สามารถลงทะเบียนชีวมาตรได้', 403));
    }

    const {
      credential_id,
      public_key,
      algorithm = 'ES256',
      device_name = 'อุปกรณ์พกพา'
    } = req.body;

    if (!credential_id || !public_key) {
      return next(new AppError('ข้อมูลการลงทะเบียนชีวมาตรไม่ครบถ้วน (ต้องระบุ credential_id และ public_key)', 400));
    }

    const mac_address = req.headers['x-device-mac'] || req.body.mac_address || null;

    // Check if credential_id already registered
    const existing = await db.get('SELECT id FROM user_biometrics WHERE credential_id = ?', [credential_id]);
    if (existing) {
      return next(new AppError('กุญแจชีวมาตรนี้เคยถูกลงทะเบียนในระบบแล้ว', 400));
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO user_biometrics 
       (id, user_id, mac_address, credential_id, public_key, algorithm, counter, device_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now', '+7 hours'))`,
      [id, req.user.id, mac_address, credential_id, public_key, algorithm, device_name]
    );

    const credential = await db.get('SELECT id, user_id, device_name, created_at FROM user_biometrics WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'ลงทะเบียน Face ID / ลายนิ้วมือ สำเร็จ',
      credential
    });
  } catch (err) {
    next(err);
  }
});

// ─── 3. List Registered Credentials for Current User ─────────────
router.get('/my-credentials', authenticate, async (req, res, next) => {
  try {
    const credentials = await db.all(
      `SELECT id, mac_address, credential_id, algorithm, device_name, created_at, last_used_at 
       FROM user_biometrics 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      credentials: credentials || []
    });
  } catch (err) {
    next(err);
  }
});

// ─── 4. Delete / Revoke a Registered Credential ──────────────────
router.delete('/credentials/:id', authenticate, async (req, res, next) => {
  try {
    const credentialId = req.params.id;
    const existing = await db.get('SELECT * FROM user_biometrics WHERE id = ?', [credentialId]);

    if (!existing) {
      return next(new AppError('ไม่พบข้อมูลชีวมาตรที่ต้องการลบ', 404));
    }

    // Admins can delete any, managers can only delete their own
    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return next(new AppError('คุณไม่มีสิทธิ์ลบข้อมูลชีวมาตรของผู้ใช้งานอื่น', 403));
    }

    await db.run('DELETE FROM user_biometrics WHERE id = ?', [credentialId]);

    res.json({
      success: true,
      message: 'ลบข้อมูลชีวมาตรเรียบร้อยแล้ว'
    });
  } catch (err) {
    next(err);
  }
});

// ─── 5. Biometric Login Options (Public / Pre-login) ────────────
router.post('/login-options', async (req, res, next) => {
  try {
    const mac_address = req.headers['x-device-mac'] || req.body?.mac_address || null;

    // Check device security status (Blacklisted, Locked Temp, etc.)
    await checkDeviceLock(mac_address);

    const challenge = generateChallenge(32);

    let credentials = [];
    if (mac_address) {
      credentials = await db.all(
        `SELECT ub.credential_id 
         FROM user_biometrics ub
         JOIN users u ON ub.user_id = u.id
         JOIN roles r ON u.role_id = r.id
         WHERE ub.mac_address = ? AND r.name IN ('admin', 'manager') AND u.status = 'active'`,
        [mac_address]
      );
    }

    res.json({
      success: true,
      data: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: (credentials || []).map(c => ({
          type: 'public-key',
          id: c.credential_id
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── 6. Biometric Login Verification (Public / Pre-login) ───────
router.post('/login-verify', async (req, res, next) => {
  try {
    const mac_address = req.headers['x-device-mac'] || req.body?.mac_address || null;
    const { credential_id, quick_pin } = req.body || {};

    // 1. Check device status
    const device = await checkDeviceLock(mac_address);

    if (!credential_id || !quick_pin) {
      return next(new AppError('ข้อมูลไม่ครบถ้วน (ต้องระบุ credential_id และ quick_pin)', 400));
    }

    // 2. Fetch biometric credential and linked user
    const biometric = await db.get(
      `SELECT ub.*, u.id as user_id, u.username, u.full_name, u.pin_code, u.password_hash, u.status as user_status, r.name as role_name, r.permissions
       FROM user_biometrics ub
       JOIN users u ON ub.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE ub.credential_id = ?`,
      [credential_id]
    );

    if (!biometric || biometric.user_status !== 'active') {
      return next(new AppError('ไม่พบข้อมูลชีวมาตรหรือบัญชีผู้ใช้งานไม่พร้อมใช้งาน', 404));
    }

    if (biometric.role_name !== 'admin' && biometric.role_name !== 'manager') {
      return next(new AppError('ชีวมาตรนี้ไม่ได้รับอนุญาตให้เข้าสู่ระบบ (เฉพาะผู้จัดการหรือผู้ดูแลระบบ)', 403));
    }

    // 3. Verify Quick PIN against user's pin_code or password_hash
    const pinStr = String(quick_pin).trim();
    let isPinValid = false;
    if (biometric.pin_code) {
      isPinValid = await bcrypt.compare(pinStr, biometric.pin_code);
    }
    if (!isPinValid && biometric.password_hash) {
      isPinValid = await bcrypt.compare(pinStr, biometric.password_hash);
    }

    // 4. Handle PIN failure -> increment failed attempts on device
    if (!isPinValid) {
      if (device && device.status !== 'WHITELISTED') {
        const nextAttempts = (device.failed_attempts || 0) + 1;

        if (nextAttempts <= 4) {
          await db.run(
            "UPDATE device_security SET failed_attempts = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
            [nextAttempts, device.mac_address]
          );
          const attemptsLeft = 5 - nextAttempts;
          return next(new AppError(`รหัส PIN ไม่ถูกต้อง (ผิดครั้งที่ ${nextAttempts}/5, เหลืออีก ${attemptsLeft} ครั้งก่อนระงับชั่วคราว)`, 401));
        } else if (nextAttempts === 5) {
          const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 5, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามใส่ PIN ชีวมาตรผิดพลาด 5 ครั้ง', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามใส่ PIN ผิดพลาด 5 ครั้ง ระบบได้ทำการหน่วงเวลา 5 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 300,
            status: 'LOCKED_TEMP'
          }));
        } else if (nextAttempts === 6) {
          const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 6, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามใส่ PIN ชีวมาตรผิดพลาดซ้ำ (ครั้งที่ 6)', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามใส่ PIN ผิดพลาดซ้ำ ระบบได้ทำการหน่วงเวลา 10 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 600,
            status: 'LOCKED_TEMP'
          }));
        } else {
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = ?, status = 'LOCKED_PERMANENT', locked_reason = 'พยายามใส่ PIN ชีวมาตรผิดพลาดสะสมเกินกำหนด', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [nextAttempts, device.mac_address]
          );
          return next(new AppError('อุปกรณ์ของคุณถูกระงับการใช้งานเนื่องจากใส่ PIN ผิดเกินกำหนด กรุณาติดต่อผู้จัดการ', 403));
        }
      }

      return next(new AppError('รหัส PIN ไม่ถูกต้อง', 401));
    }

    // 5. PIN is valid -> Reset failed_attempts and update last_used_at
    if (device) {
      await db.run(
        "UPDATE device_security SET failed_attempts = 0, lock_until = NULL, last_user_name = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
        [biometric.full_name, device.mac_address]
      );
    }

    await db.run(
      "UPDATE user_biometrics SET last_used_at = datetime('now', '+7 hours'), counter = counter + 1 WHERE credential_id = ?",
      [credential_id]
    );

    // 6. Fetch assigned stores
    let stores = [];
    if (biometric.role_name === 'admin') {
      stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
    } else {
      stores = await db.all(
        "SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1 AND s.is_active = 1",
        [biometric.user_id]
      );
    }

    let parsedPerms = {};
    try {
      parsedPerms = typeof biometric.permissions === 'string' ? JSON.parse(biometric.permissions) : (biometric.permissions || {});
    } catch (_) {}

    // 7. Issue JWT token
    const token = jwt.sign(
      { id: biometric.user_id, username: biometric.username, role: biometric.role_name, permissions: parsedPerms },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: biometric.user_id,
          username: biometric.username,
          fullName: biometric.full_name,
          role: biometric.role_name,
          permissions: parsedPerms
        },
        stores: stores || []
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
