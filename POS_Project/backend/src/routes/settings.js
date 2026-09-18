const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const row = await db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row || {} });
  } catch (err) { next(err); }
});

router.put("/", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url } = req.body;
    await db.run("UPDATE stores SET name=?, address=?, phone=?, tax_id=?, vat_rate=?, receipt_header=?, receipt_footer=?, logo_url=?, updated_at=datetime('now', '+7 hours') WHERE id=?", 
      [store_name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url, req.store_id]);
    const row = await db.get("SELECT * FROM stores WHERE id = ?", [req.store_id]);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// ─── DEVICE SECURITY & WHITELIST MANAGEMENT (ADMIN ONLY) ───────────

/**
 * GET /api/settings/devices
 * Get all tracked devices, lockout status, and bot signals
 */
router.get("/devices", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const mac = req.headers['x-device-mac'];
    if (mac) {
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
      }

      const existing = await db.get("SELECT * FROM device_security WHERE mac_address = ?", [mac]);
      if (!existing) {
        const { v4: uuidv4 } = require("uuid");
        await db.run(
          `INSERT INTO device_security (id, mac_address, ip_address, location, user_agent, device_name, last_user_name, status, failed_attempts)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'NORMAL', 0)`,
          [uuidv4(), mac, ip, location, userAgent, deviceName, req.user?.fullName || req.user?.username || 'Admin']
        );
      } else {
        await db.run(
          `UPDATE device_security 
           SET ip_address = ?, location = ?, user_agent = ?, device_name = ?, last_user_name = ?, updated_at = datetime('now', '+7 hours')
           WHERE mac_address = ?`,
          [ip, location, userAgent, deviceName, req.user?.fullName || req.user?.username || 'Admin', mac]
        );
      }
    }

    const devices = await db.all("SELECT * FROM device_security ORDER BY updated_at DESC");
    res.json({ success: true, data: devices || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/devices/:id/whitelist
 * Admin Whitelist / Unlock device
 */
router.post("/devices/:id/whitelist", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const device = await db.get("SELECT * FROM device_security WHERE id = ?", [req.params.id]);
    if (!device) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลอุปกรณ์นี้" });

    await db.run(
      `UPDATE device_security 
       SET status = 'WHITELISTED', failed_attempts = 0, lock_until = NULL, updated_at = datetime('now', '+7 hours')
       WHERE id = ?`,
      [req.params.id]
    );

    // Also mark any PENDING approval requests for this device as APPROVED
    await db.run(
      `UPDATE approval_requests 
       SET status = 'APPROVED', approver_name = ?, responded_at = datetime('now', '+7 hours')
       WHERE document_type = 'device_unlock' AND document_id = ? AND status = 'PENDING'`,
      [req.user.full_name || req.user.username || 'Admin (Web)', device.mac_address]
    );

    res.json({ success: true, message: `ปลดล็อคและอนุญาต (Whitelist) อุปกรณ์ ${device.mac_address} สำเร็จ` });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/devices/:id/blacklist
 * Admin Blacklist / Permanent Ban device
 */
router.post("/devices/:id/blacklist", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const device = await db.get("SELECT * FROM device_security WHERE id = ?", [req.params.id]);
    if (!device) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลอุปกรณ์นี้" });

    await db.run(
      `UPDATE device_security 
       SET status = 'BLACKLISTED', updated_at = datetime('now', '+7 hours')
       WHERE id = ?`,
      [req.params.id]
    );

    // Also mark any PENDING approval requests for this device as REJECTED
    await db.run(
      `UPDATE approval_requests 
       SET status = 'REJECTED', approver_name = ?, responded_at = datetime('now', '+7 hours')
       WHERE document_type = 'device_unlock' AND document_id = ? AND status = 'PENDING'`,
      [req.user.full_name || req.user.username || 'Admin (Web)', device.mac_address]
    );

    res.json({ success: true, message: `ระงับการใช้งานถาวร (Blacklist) อุปกรณ์ ${device.mac_address} สำเร็จ` });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/devices/:id/reset
 * Admin Reset failed attempts to 0 & status to NORMAL
 */
router.post("/devices/:id/reset", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const device = await db.get("SELECT * FROM device_security WHERE id = ?", [req.params.id]);
    if (!device) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลอุปกรณ์นี้" });

    await db.run(
      `UPDATE device_security 
       SET status = 'NORMAL', failed_attempts = 0, lock_until = NULL, updated_at = datetime('now', '+7 hours')
       WHERE id = ?`,
      [req.params.id]
    );

    res.json({ success: true, message: `รีเซ็ตประวัติความผิดพลาดของอุปกรณ์ ${device.mac_address} เรียบร้อยแล้ว` });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/settings/devices/:id
 * Delete device entry
 */
router.delete("/devices/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    await db.run("DELETE FROM device_security WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "ลบประวัติอุปกรณ์สำเร็จ" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

