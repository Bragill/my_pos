const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../database/dbHelper");
const { AppError } = require("../middleware/errorHandler");
const { authenticate } = require("../middleware/auth");
const lineService = require("../services/lineService");
const router = express.Router();

const getJwtSecret = () => process.env.JWT_SECRET || "pos_secret_key_dev_only";

// ─── Security Helpers ─────────────────────────────────────────────
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

function getClientMeta(req) {
  const ip = req.headers['cf-connecting-ip'] || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.ip || 
             '127.0.0.1';
             
  const city = req.headers['cf-ipcity'] ? decodeURIComponent(req.headers['cf-ipcity']) : 'Bangkok';
  const country = req.headers['cf-ipcountry'] || 'TH';
  const location = `${city}, ${country}`;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  let deviceName = 'Unknown Device';
  if (req.headers['x-device-name']) {
    try {
      deviceName = decodeURIComponent(req.headers['x-device-name']);
    } catch {
      deviceName = req.headers['x-device-name'];
    }
  } else if (req.body?.device_name) {
    deviceName = req.body.device_name;
  }

  return { ip, location, userAgent, deviceName };
}

async function getOrCreateDevice(macAddress, meta, userName = null) {
  if (!macAddress) return null;
  let device = await db.get("SELECT * FROM device_security WHERE mac_address = ?", [macAddress]);
  if (!device) {
    const id = uuidv4();
    await db.run(
      `INSERT INTO device_security 
       (id, mac_address, ip_address, location, user_agent, device_name, last_user_name, failed_attempts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'NORMAL')`,
      [id, macAddress, meta.ip, meta.location, meta.userAgent, meta.deviceName, userName]
    );
    device = await db.get("SELECT * FROM device_security WHERE mac_address = ?", [macAddress]);
  } else {
    // Keep IP, location, user agent, device name, and user updated
    let query = "UPDATE device_security SET ip_address = ?, location = ?, user_agent = ?, updated_at = datetime('now', '+7 hours')";
    const params = [meta.ip, meta.location, meta.userAgent];
    
    if (meta.deviceName && meta.deviceName !== 'Unknown Device') {
      query += ", device_name = ?";
      params.push(meta.deviceName);
    }
    if (userName) {
      query += ", last_user_name = ?";
      params.push(userName);
    }
    query += " WHERE mac_address = ?";
    params.push(macAddress);

    await db.run(query, params);
    device = await db.get("SELECT * FROM device_security WHERE mac_address = ?", [macAddress]);
  }
  return device;
}

async function triggerPermanentLockAndLineNotification(device, reason, isBot = false, meta) {
  if (device.status === 'WHITELISTED') return;
  const mac = device.mac_address;
  await db.run(
    `UPDATE device_security 
     SET status = 'LOCKED_PERMANENT', locked_reason = ?, is_bot = ?, ip_address = ?, location = ?, updated_at = datetime('now', '+7 hours')
     WHERE mac_address = ?`,
    [reason, isBot ? 1 : 0, meta.ip, meta.location, mac]
  );

  // Check if store for LINE notifications exists with a valid long token
  const lineSetting = await db.get(
    "SELECT store_id FROM line_settings WHERE LENGTH(channel_access_token) > 50 AND target_group_id IS NOT NULL AND target_group_id != '' ORDER BY updated_at DESC LIMIT 1"
  );
  const fallbackStore = await db.get("SELECT id FROM stores LIMIT 1");
  const targetStoreId = lineSetting?.store_id || fallbackStore?.id || 'default_store';

  // Check if already has a PENDING approval request for this mac
  const existingReq = await db.get(
    "SELECT * FROM approval_requests WHERE document_type = 'device_unlock' AND document_id = ? AND status = 'PENDING'",
    [mac]
  );

  if (!existingReq) {
    const approvalId = uuidv4();
    const payloadJson = JSON.stringify({
      mac_address: mac,
      ip_address: meta.ip,
      location: meta.location,
      user_agent: meta.userAgent,
      is_bot: isBot,
      locked_reason: reason,
      failed_attempts: device.failed_attempts || 0
    });

    const approvalObj = {
      id: approvalId,
      store_id: targetStoreId,
      document_type: 'device_unlock',
      document_id: mac,
      amount: 0,
      reason: reason,
      requester_id: 'system',
      requester_name: isBot ? 'ระบบตรวจจับบอทอัตโนมัติ' : 'ระบบป้องกันรหัสผ่านอัตโนมัติ',
      status: 'PENDING',
      payload: payloadJson
    };

    await db.run(
      `INSERT INTO approval_requests 
       (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [approvalObj.id, approvalObj.store_id, approvalObj.document_type, approvalObj.document_id, approvalObj.amount, approvalObj.reason, approvalObj.requester_id, approvalObj.requester_name, approvalObj.payload]
    );

    // Push notification to LINE
    try {
      await lineService.sendApprovalRequestNotification(approvalObj);
    } catch (lineErr) {
      console.warn('[Security] Failed to push device lock notification to LINE:', lineErr.message);
    }
  }
}

/**
 * POST /api/auth/check-device
 * Pre-login device status, auto-registration, and lockout countdown check
 */
router.post("/check-device", async (req, res, next) => {
  try {
    const mac_address = req.headers['x-device-mac'] || req.body.mac_address;
    if (!mac_address) return res.json({ success: true, locked: false, status: 'NORMAL' });

    const meta = getClientMeta(req);
    // Auto-create or touch device so it appears in device management immediately
    const device = await getOrCreateDevice(mac_address, meta, req.body.username || null);

    if (device.status === 'BLACKLISTED') {
      return res.json({ 
        success: true, 
        locked: true, 
        permanent: true, 
        status: 'BLACKLISTED', 
        reason: 'อุปกรณ์นี้ถูกปฏิเสธและระงับการใช้งานถาวร (Blacklisted) กรุณาติดต่อผู้ดูแลระบบ' 
      });
    }

    if (device.status === 'LOCKED_PERMANENT') {
      return res.json({ 
        success: true, 
        locked: true, 
        permanent: true, 
        status: 'LOCKED_PERMANENT', 
        reason: device.locked_reason || 'อุปกรณ์นี้ถูกระงับการเข้าถึงเนื่องจากตรวจพบพฤติกรรมผิดปกติ ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว' 
      });
    }

    if (device.status === 'LOCKED_TEMP' && device.lock_until) {
      const lockUntil = parseLockTimestamp(device.lock_until);
      const now = Date.now();
      if (lockUntil && lockUntil > now) {
        const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
        return res.json({ 
          success: true, 
          locked: true, 
          permanent: false, 
          status: 'LOCKED_TEMP', 
          remaining_seconds: remainingSeconds, 
          lock_until: device.lock_until, 
          reason: device.locked_reason 
        });
      } else {
        // Expired temp lock, restore to NORMAL
        await db.run("UPDATE device_security SET status = 'NORMAL', lock_until = NULL WHERE mac_address = ?", [mac_address]);
        return res.json({ success: true, locked: false, status: 'NORMAL' });
      }
    }

    return res.json({ success: true, locked: false, status: device.status });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/ping-device
 * Register/touch active device from app session
 */
router.post("/ping-device", async (req, res, next) => {
  try {
    const mac = req.headers['x-device-mac'] || req.body?.mac_address;
    if (!mac) return res.json({ success: true, registered: false });
    const meta = getClientMeta(req);
    const userName = req.body?.user_name || req.body?.username || null;
    const device = await getOrCreateDevice(mac, meta, userName);
    res.json({ success: true, device });
  } catch (err) {
    next(err);
  }
});

// ─── LOGIN WITH PASSWORD ──────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { 
      username, 
      password, 
      hp_token, 
      submit_elapsed_ms = 0, 
      is_headless = false 
    } = req.body;

    const mac_address = req.headers['x-device-mac'] || req.body.mac_address;
    const meta = getClientMeta(req);
    const device = await getOrCreateDevice(mac_address, meta, username);

    // 1. Check if device is permanently blocked or blacklisted
    if (device) {
      if (device.status === 'BLACKLISTED') {
        return next(new AppError('อุปกรณ์นี้ถูกระงับการใช้งานถาวร (Blacklisted)', 403));
      }
      if (device.status === 'LOCKED_PERMANENT') {
        return next(new AppError('อุปกรณ์นี้ถูกระงับการเข้าใช้งานเนื่องจากความปลอดภัย ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว', 403));
      }
      if (device.status === 'LOCKED_TEMP' && device.lock_until) {
        const lockUntil = parseLockTimestamp(device.lock_until);
        const now = Date.now();
        if (lockUntil && lockUntil > now) {
          const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
          const remainingMinutes = Math.ceil(remainingSeconds / 60);
          return next(new AppError(`พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารออีกประมาณ ${remainingMinutes} นาทีก่อนลองใหม่`, 429, {
            lock_until: device.lock_until,
            remaining_seconds: remainingSeconds,
            status: 'LOCKED_TEMP'
          }));
        }
      }
    }

    // 2. Bot / Automation Script Detection
    const isBotDetected = Boolean(
      (hp_token && String(hp_token).trim() !== '') ||
      is_headless === true ||
      (submit_elapsed_ms > 0 && submit_elapsed_ms < 300)
    );

    if (isBotDetected && device && device.status !== 'WHITELISTED') {
      const reason = 'ตรวจพบพฤติกรรมบอท/สคริปต์อัตโนมัติ (Bot or Automation Script Detected)';
      await triggerPermanentLockAndLineNotification(device, reason, true, meta);
      return next(new AppError('ตรวจพบลักษณะการทำงานของสคริปต์/บอท อุปกรณ์นี้ถูกระงับการใช้งานทันทีและส่งคำขอไปยัง LINE', 403));
    }

    // 3. Authenticate User
    const user = await db.get(
      "SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ? AND u.status = 'active'", 
      [username]
    );
    
    let isMatch = false;
    if (user) {
      isMatch = await bcrypt.compare(password, user.password_hash);
    }

    // Handle Authentication Failure
    if (!user || !isMatch) {
      if (device && device.status !== 'WHITELISTED') {
        const nextAttempts = (device.failed_attempts || 0) + 1;

        if (nextAttempts <= 4) {
          await db.run(
            "UPDATE device_security SET failed_attempts = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
            [nextAttempts, device.mac_address]
          );
          const attemptsLeft = 5 - nextAttempts;
          return next(new AppError(`ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ผิดครั้งที่ ${nextAttempts}/5, เหลืออีก ${attemptsLeft} ครั้งก่อนระงับชั่วคราว)`, 401));
        } else if (nextAttempts === 5) {
          // Lock for 5 minutes
          const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 5, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามเข้าสู่ระบบผิดพลาด 5 ครั้ง', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามเข้าสู่ระบบผิดพลาด 5 ครั้ง ระบบได้ทำการหน่วงเวลา 5 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 300,
            status: 'LOCKED_TEMP'
          }));
        } else if (nextAttempts === 6) {
          // Lock for 10 minutes
          const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 6, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามเข้าสู่ระบบผิดพลาดซ้ำ (ครั้งที่ 6)', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามเข้าสู่ระบบผิดพลาดซ้ำ ระบบได้ทำการหน่วงเวลา 10 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 600,
            status: 'LOCKED_TEMP'
          }));
        } else {
          // 7 or more -> Permanent Lock & LINE Notification
          await triggerPermanentLockAndLineNotification(
            device, 
            `พยายามเข้าสู่ระบบผิดพลาดสะสมเกินกำหนด (${nextAttempts} ครั้ง)`, 
            false, 
            meta
          );
          return next(new AppError('อุปกรณ์ของคุณถูกระงับการใช้งานเนื่องจากใส่รหัสผิดเกินกำหนด ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว', 403));
        }
      }

      return next(new AppError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401));
    }
    
    // 4. Successful Login: Reset failed attempts & record user
    if (device) {
      await db.run(
        "UPDATE device_security SET failed_attempts = 0, lock_until = NULL, last_user_name = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
        [user.full_name, device.mac_address]
      );
    }

    // Get assigned stores
    let stores = [];
    if (user.role_name === 'admin') {
      stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
    } else {
      stores = await db.all(
        "SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1 AND s.is_active = 1", 
        [user.id]
      );
    }

    let parsedPerms = {};
    try { parsedPerms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {}); } catch(e) {}

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_name, permissions: parsedPerms }, 
      getJwtSecret(), 
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({ 
      success: true, 
      data: { 
        token, 
        user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name, permissions: parsedPerms }, 
        stores 
      } 
    });
  } catch (err) { 
    console.error("Detailed Login Error:", err);
    next(err); 
  }
});

// ─── LOGIN WITH 6-DIGIT PIN ───────────────────────────────────────
router.post("/pin-login", async (req, res, next) => {
  try {
    const { 
      pin, 
      hp_token, 
      submit_elapsed_ms = 0, 
      is_headless = false 
    } = req.body;

    const mac_address = req.headers['x-device-mac'] || req.body.mac_address;
    const pinStr = String(pin || '').trim();
    const meta = getClientMeta(req);
    const device = await getOrCreateDevice(mac_address, meta);

    // 1. Check if device is permanently blocked or blacklisted
    if (device) {
      if (device.status === 'BLACKLISTED') {
        return next(new AppError('อุปกรณ์นี้ถูกระงับการใช้งานถาวร (Blacklisted)', 403));
      }
      if (device.status === 'LOCKED_PERMANENT') {
        return next(new AppError('อุปกรณ์นี้ถูกระงับการเข้าใช้งานเนื่องจากความปลอดภัย ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว', 403));
      }
      if (device.status === 'LOCKED_TEMP' && device.lock_until) {
        const lockUntil = parseLockTimestamp(device.lock_until);
        const now = Date.now();
        if (lockUntil && lockUntil > now) {
          const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
          const remainingMinutes = Math.ceil(remainingSeconds / 60);
          return next(new AppError(`พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารออีกประมาณ ${remainingMinutes} นาทีก่อนลองใหม่`, 429, {
            lock_until: device.lock_until,
            remaining_seconds: remainingSeconds,
            status: 'LOCKED_TEMP'
          }));
        }
      }
    }

    // 2. Bot / Automation Script Detection
    const isBotDetected = Boolean(
      (hp_token && String(hp_token).trim() !== '') ||
      is_headless === true ||
      (submit_elapsed_ms > 0 && submit_elapsed_ms < 300)
    );

    if (isBotDetected && device && device.status !== 'WHITELISTED') {
      const reason = 'ตรวจพบพฤติกรรมบอท/สคริปต์อัตโนมัติ (Bot or Automation Script Detected)';
      await triggerPermanentLockAndLineNotification(device, reason, true, meta);
      return next(new AppError('ตรวจพบลักษณะการทำงานของสคริปต์/บอท อุปกรณ์นี้ถูกระงับการใช้งานทันทีและส่งคำขอไปยัง LINE', 403));
    }

    // 3. Match 6-digit PIN against active users
    const users = await db.all("SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.status = 'active' AND u.pin_code IS NOT NULL");
    
    let matchedUser = null;
    if (pinStr.length === 6) {
      const results = await Promise.all(
        users.map(user => bcrypt.compare(pinStr, user.pin_code).then(match => ({ user, match })))
      );
      matchedUser = results.find(r => r.match)?.user ?? null;
    }

    // Handle Authentication Failure
    if (!matchedUser) {
      if (device && device.status !== 'WHITELISTED') {
        const nextAttempts = (device.failed_attempts || 0) + 1;

        if (nextAttempts <= 4) {
          await db.run(
            "UPDATE device_security SET failed_attempts = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
            [nextAttempts, device.mac_address]
          );
          const attemptsLeft = 5 - nextAttempts;
          return next(new AppError(`PIN Code ไม่ถูกต้อง (ผิดครั้งที่ ${nextAttempts}/5, เหลืออีก ${attemptsLeft} ครั้งก่อนระงับชั่วคราว)`, 401));
        } else if (nextAttempts === 5) {
          // Lock for 5 minutes
          const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 5, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามเข้าสู่ระบบ PIN ผิดพลาด 5 ครั้ง', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามใส่ PIN ผิดพลาด 5 ครั้ง ระบบได้ทำการหน่วงเวลา 5 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 300,
            status: 'LOCKED_TEMP'
          }));
        } else if (nextAttempts === 6) {
          // Lock for 10 minutes
          const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await db.run(
            `UPDATE device_security 
             SET failed_attempts = 6, status = 'LOCKED_TEMP', lock_until = ?, locked_reason = 'พยายามเข้าสู่ระบบ PIN ผิดพลาดซ้ำ (ครั้งที่ 6)', updated_at = datetime('now', '+7 hours')
             WHERE mac_address = ?`,
            [lockUntil, device.mac_address]
          );
          return next(new AppError('คุณพยายามใส่ PIN ผิดพลาดซ้ำ ระบบได้ทำการหน่วงเวลา 10 นาที กรุณารอก่อนลองใหม่', 429, {
            lock_until: lockUntil,
            remaining_seconds: 600,
            status: 'LOCKED_TEMP'
          }));
        } else {
          // 7 or more -> Permanent Lock & LINE Notification
          await triggerPermanentLockAndLineNotification(
            device, 
            `พยายามเข้าสู่ระบบ PIN ผิดพลาดสะสมเกินกำหนด (${nextAttempts} ครั้ง)`, 
            false, 
            meta
          );
          return next(new AppError('อุปกรณ์ของคุณถูกระงับการใช้งานเนื่องจากใส่ PIN ผิดเกินกำหนด ระบบได้ส่งคำขอปลดล็อคไปยังผู้จัดการผ่าน LINE แล้ว', 403));
        }
      }

      return next(new AppError("PIN Code ไม่ถูกต้อง", 401));
    }
    
    // 4. Successful PIN Login: Reset failed attempts & record user
    if (device) {
      await db.run(
        "UPDATE device_security SET failed_attempts = 0, lock_until = NULL, last_user_name = ?, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
        [matchedUser.full_name, device.mac_address]
      );
    }

    // Get assigned stores
    let stores = [];
    if (matchedUser.role_name === 'admin') {
      stores = await db.all("SELECT id, name FROM stores WHERE is_active = 1");
    } else {
      stores = await db.all(
        "SELECT s.id, s.name FROM stores s JOIN user_stores us ON s.id = us.store_id WHERE us.user_id = ? AND us.is_active = 1 AND s.is_active = 1", 
        [matchedUser.id]
      );
    }

    let parsedPerms = {};
    try { parsedPerms = typeof matchedUser.permissions === 'string' ? JSON.parse(matchedUser.permissions) : (matchedUser.permissions || {}); } catch(e) {}

    const token = jwt.sign(
      { id: matchedUser.id, username: matchedUser.username, role: matchedUser.role_name, permissions: parsedPerms }, 
      getJwtSecret(), 
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({ 
      success: true, 
      data: { 
        token, 
        user: { id: matchedUser.id, username: matchedUser.username, fullName: matchedUser.full_name, role: matchedUser.role_name, permissions: parsedPerms }, 
        stores 
      } 
    });
  } catch (err) { 
    console.error("Detailed PIN Login Error:", err);
    next(err); 
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.get("SELECT u.id, u.username, u.full_name as fullName, r.name as role, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?", [req.user.id]);
    if (!user) return next(new AppError("ไม่พบข้อมูลผู้ใช้", 404));
    let parsedPerms = {};
    try { parsedPerms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {}); } catch(e) {}
    res.json({ success: true, data: { ...user, permissions: parsedPerms } });
  } catch (err) { next(err); }
});

module.exports = router;