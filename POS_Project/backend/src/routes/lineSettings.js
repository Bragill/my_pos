const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const { authenticate, authorize } = require('../middleware/auth');
const lineService = require('../services/lineService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Mask token string for safe display
 */
function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= 8) return '********';
  return str.slice(0, 4) + '****************' + str.slice(-4);
}

/**
 * GET /api/settings/line
 * Retrieve LINE configuration for a store
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const storeId = req.query.store_id || req.store_id;
    let settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);
    
    if (!settings) {
      settings = {
        store_id: storeId,
        channel_access_token: '',
        channel_secret: '',
        target_group_id: '',
        enable_daily_report: 1,
        daily_report_time: '22:00',
        enable_approval_notifications: 1
      };
    }

    // Return credentials for store manager/admin
    const safeData = {
      ...settings,
      channel_access_token: settings.channel_access_token || '',
      channel_secret: settings.channel_secret || '',
      channel_access_token_masked: maskSecret(settings.channel_access_token),
      channel_secret_masked: maskSecret(settings.channel_secret),
      has_token: Boolean(settings.channel_access_token),
      has_secret: Boolean(settings.channel_secret)
    };

    res.json({ success: true, data: safeData });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings/line
 * Save LINE configuration
 */
router.put('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const storeId = req.body.store_id || req.query.store_id || req.store_id;
    const {
      channel_access_token,
      channel_secret,
      target_group_id,
      enable_daily_report = 1,
      daily_report_time = '22:00',
      enable_approval_notifications = 1
    } = req.body;

    const existing = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);

    const finalToken = (channel_access_token && !channel_access_token.includes('****'))
      ? channel_access_token
      : existing?.channel_access_token || '';

    const finalSecret = (channel_secret && !channel_secret.includes('****'))
      ? channel_secret
      : existing?.channel_secret || '';

    const isTimeChanged = existing && existing.daily_report_time !== (daily_report_time || '22:00');

    if (existing) {
      await db.run(`
        UPDATE line_settings 
        SET channel_access_token = ?,
            channel_secret = ?,
            target_group_id = ?,
            enable_daily_report = ?,
            daily_report_time = ?,
            enable_approval_notifications = ?,
            last_daily_report_sent_date = CASE WHEN ? = 1 THEN NULL ELSE last_daily_report_sent_date END,
            updated_at = datetime('now', '+7 hours')
        WHERE store_id = ?
      `, [
        finalToken,
        finalSecret,
        target_group_id || existing.target_group_id,
        enable_daily_report ? 1 : 0,
        daily_report_time || '22:00',
        enable_approval_notifications ? 1 : 0,
        isTimeChanged ? 1 : 0,
        storeId
      ]);
    } else {
      await db.run(`
        INSERT INTO line_settings 
        (id, store_id, channel_access_token, channel_secret, target_group_id, enable_daily_report, daily_report_time, enable_approval_notifications)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(),
        storeId,
        finalToken,
        finalSecret,
        target_group_id || '',
        enable_daily_report ? 1 : 0,
        daily_report_time || '22:00',
        enable_approval_notifications ? 1 : 0
      ]);
    }

    const updated = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);
    res.json({
      success: true,
      message: 'บันทึกการตั้งค่า LINE สำเร็จ',
      data: {
        ...updated,
        channel_access_token_masked: maskSecret(updated.channel_access_token),
        channel_secret_masked: maskSecret(updated.channel_secret)
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/line/test
 * Send a test connection message to the configured target group
 */
router.post('/test', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const storeId = req.body.store_id || req.query.store_id || req.store_id;
    await lineService.sendTestMessage(storeId);
    res.json({ success: true, message: 'ส่งข้อความทดสอบเข้ากลุ่ม LINE สำเร็จแล้ว!' });
  } catch (err) {
    next(new AppError(err.message || 'ไม่สามารถส่งข้อความทดสอบได้ ตรวจสอบ Token และ Group ID', 400));
  }
});

/**
 * POST /api/settings/line/test-approval
 * Send a simulated approval request card to LINE for testing
 */
router.post('/test-approval', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const storeId = req.body.store_id || req.query.store_id || req.store_id;
    const testApprovalId = uuidv4();
    const testDocId = 'TEST-' + Math.floor(1000 + Math.random() * 9000);

    const testPayload = {
      items: [
        { name: 'น้ำเต้าหู้+เครื่อง', quantity: 1, unit: 'ถุง', total_price: 10.00 },
        { name: 'น้ำเต้าหู้ (สูตรโบราณ)', quantity: 2, unit: 'ถุง', total_price: 16.00 },
        { name: 'ปาท่องโก๋', quantity: 4, unit: 'คู่', total_price: 20.00 }
      ],
      payment_method: 'promptpay',
      total_amount: 46.00
    };

    // Insert test approval request
    await db.run(`
      INSERT INTO approval_requests
      (id, store_id, document_type, document_id, requester_id, requester_name, amount, reason, status, payload)
      VALUES (?, ?, 'sale_void', ?, ?, ?, ?, ?, 'PENDING', ?)
    `, [
      testApprovalId,
      storeId,
      testDocId,
      req.user?.id || 'admin',
      req.user?.name || req.user?.username || 'ผู้ดูแลระบบ',
      46.00,
      'ทดสอบระบบขออนุมัติผ่าน LINE (Test Approval Flow)',
      JSON.stringify(testPayload)
    ]);

    const testReq = await db.get('SELECT * FROM approval_requests WHERE id = ?', [testApprovalId]);
    await lineService.sendApprovalRequestNotification(testReq);

    res.json({
      success: true,
      message: `ส่งการ์ดทดสอบขออนุมัติ (#${testDocId}) เข้า LINE สำเร็จแล้ว! คุณสามารถกดปุ่ม [อนุมัติ] หรือ [ไม่อนุมัติ] ใน LINE เพื่อทดสอบผลตอบรับได้ทันที`
    });
  } catch (err) {
    next(new AppError(err.message || 'ไม่สามารถส่งการ์ดทดสอบขออนุมัติได้ ตรวจสอบการตั้งค่า LINE', 400));
  }
});

/**
 * POST /api/settings/line/send-daily-report-now
 * Manually trigger daily sales report push
 */
router.post('/send-daily-report-now', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const storeId = req.body.store_id || req.query.store_id || req.store_id;
    await lineService.sendDailySalesReport(storeId, true);
    res.json({ success: true, message: 'ส่งรายงานสรุปยอดขายเข้ากลุ่ม LINE เรียบร้อยแล้ว!' });
  } catch (err) {
    next(new AppError(err.message || 'ส่งรายงานล้มเหลว ตรวจสอบการตั้งค่า LINE', 400));
  }
});

/**
 * GET /api/settings/line/detect-id
 * Fetch the latest detected Group ID or User ID from webhook events
 */
router.get('/detect-id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const latestEvent = await db.get(`
      SELECT group_id, user_id, event_type, message_text, created_at
      FROM line_webhook_events
      WHERE (group_id IS NOT NULL OR user_id IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (!latestEvent) {
      return res.json({
        success: true,
        detected: false,
        message: 'ยังไม่พบข้อมูลเหตุการณ์จาก LINE (กรุณาส่งข้อความหรือพิมพ์ "id" ในกลุ่ม LINE เพื่อให้ระบบตรวจจับ)'
      });
    }

    res.json({
      success: true,
      detected: true,
      data: {
        target_id: latestEvent.group_id || latestEvent.user_id,
        is_group: Boolean(latestEvent.group_id),
        group_id: latestEvent.group_id,
        user_id: latestEvent.user_id,
        event_type: latestEvent.event_type,
        message_text: latestEvent.message_text,
        created_at: latestEvent.created_at
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
