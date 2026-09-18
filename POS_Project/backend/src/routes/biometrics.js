const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper to generate base64url random bytes
function generateChallenge(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
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

module.exports = router;
