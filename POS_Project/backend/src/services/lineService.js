const crypto = require('crypto');
const axios = require('axios');
const db = require('../database/dbHelper');
const {
  buildDailySalesReportFlex,
  buildApprovalRequestFlex,
  buildApprovalResultFlex
} = require('./lineFlexTemplates');

/**
 * Verify LINE Webhook Signature using HMAC-SHA256
 */
function verifySignature(bodyString, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  try {
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(bodyString)
      .digest('base64');
    
    // Constant-time string comparison
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (err) {
    console.error('[LINE Service] verifySignature error:', err.message);
    return false;
  }
}

/**
 * Push message to LINE user or group
 */
async function pushMessage(channelAccessToken, to, messages) {
  if (!channelAccessToken || !to) {
    throw new Error('LINE channelAccessToken and recipient ID (to) are required');
  }

  const payload = {
    to,
    messages: Array.isArray(messages) ? messages : [messages]
  };

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[LINE Service] pushMessage failed (${response.status}):`, errBody);
    throw new Error(`LINE pushMessage failed (${response.status}): ${errBody}`);
  }

  return await response.json().catch(() => ({}));
}

/**
 * Reply to a LINE webhook message/postback
 */
async function replyMessage(channelAccessToken, replyToken, messages) {
  if (!channelAccessToken || !replyToken) {
    throw new Error('LINE channelAccessToken and replyToken are required');
  }

  const payload = {
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages]
  };

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.warn(`[LINE Service] replyMessage failed (${response.status}):`, errBody);
    throw new Error(`LINE replyMessage failed (${response.status}): ${errBody}`);
  }

  return await response.json().catch(() => ({}));
}

/**
 * Send test message to target group
 */
async function sendTestMessage(storeId) {
  const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);
  if (!settings || !settings.channel_access_token || !settings.target_group_id) {
    throw new Error('กรุณากรอก Channel Access Token และ Target Group ID ให้ครบถ้วนก่อนทดสอบ');
  }

  const store = await db.get('SELECT name FROM stores WHERE id = ?', [storeId]);
  const storeName = store?.name || 'POS System';

  const testFlex = {
    type: 'flex',
    altText: '🔔 ทดสอบการเชื่อมต่อระบบ LINE POS',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '✅ เชื่อมต่อระบบสำเร็จ', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: storeName, color: '#E8F5E9', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'ระบบ POS ได้เชื่อมต่อกับ LINE Messaging API เรียบร้อยแล้ว', size: 'sm', color: '#333333', wrap: true },
          { type: 'text', text: 'ระบบพร้อมสำหรับการส่งรายงานสรุปยอดขาย และคำขออนุมัติรายการสำคัญ', size: 'xs', color: '#777777', wrap: true, margin: 'sm' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'เวลาทดสอบ:', size: 'xs', color: '#888888', flex: 1 },
              { type: 'text', text: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }), size: 'xs', color: '#111111', align: 'end', flex: 2 }
            ]
          }
        ]
      }
    }
  };

  return await pushMessage(settings.channel_access_token, settings.target_group_id, testFlex);
}

/**
 * Fetch daily sales statistics for a store
 */
async function getDailySalesStats(storeId, targetDateStr = null) {
  // If targetDateStr not specified, use today's date in Bangkok time (YYYY-MM-DD)
  const now = new Date();
  const bkkDate = targetDateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);

  const startOfDay = `${bkkDate} 00:00:00`;
  const endOfDay = `${bkkDate} 23:59:59`;

  // 1. Completed orders
  const salesSummary = await db.get(`
    SELECT 
      COUNT(id) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM orders 
    WHERE store_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?
  `, [storeId, startOfDay, endOfDay]);

  // 2. Voided orders
  const voidSummary = await db.get(`
    SELECT 
      COUNT(id) as void_count,
      COALESCE(SUM(total_amount), 0) as void_amount
    FROM orders 
    WHERE store_id = ? AND status = 'voided' AND created_at BETWEEN ? AND ?
  `, [storeId, startOfDay, endOfDay]);

  // 3. Payment methods breakdown
  const payments = await db.all(`
    SELECT 
      COALESCE(payment_method, 'cash') as method,
      COALESCE(SUM(total_amount), 0) as total
    FROM orders 
    WHERE store_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?
    GROUP BY payment_method
  `, [storeId, startOfDay, endOfDay]);

  const paymentBreakdown = {};
  for (const p of payments) {
    paymentBreakdown[p.method] = p.total;
  }

  // 4. Top selling products
  const topProducts = await db.all(`
    SELECT 
      p.name,
      SUM(oi.quantity) as quantity,
      SUM(oi.total_price) as total
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE o.store_id = ? AND o.status = 'completed' AND o.created_at BETWEEN ? AND ?
    GROUP BY p.id, p.name
    ORDER BY quantity DESC
    LIMIT 5
  `, [storeId, startOfDay, endOfDay]);

  const store = await db.get('SELECT name FROM stores WHERE id = ?', [storeId]);

  return {
    storeName: store?.name || 'POS สาขาหลัก',
    dateStr: bkkDate,
    totalSales: salesSummary?.total_sales || 0,
    totalOrders: salesSummary?.total_orders || 0,
    voidCount: voidSummary?.void_count || 0,
    voidAmount: voidSummary?.void_amount || 0,
    paymentBreakdown,
    topProducts
  };
}

/**
 * Send daily sales summary report now
 * @param {string} storeId
 * @param {boolean} isManual If true, called via manual test button; won't block scheduled cron
 */
async function sendDailySalesReport(storeId, isManual = false) {
  const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [storeId]);
  if (!settings || !settings.channel_access_token || !settings.target_group_id) {
    throw new Error('LINE integration is not configured for this store');
  }

  const reportData = await getDailySalesStats(storeId);
  const flexMessage = buildDailySalesReportFlex(reportData);

  const res = await pushMessage(settings.channel_access_token, settings.target_group_id, flexMessage);

  // Update last sent date only if this is an automated scheduled push
  if (!isManual) {
    const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    await db.run('UPDATE line_settings SET last_daily_report_sent_date = ? WHERE store_id = ?', [todayBkk, storeId]);
  }

  return res;
}

/**
 * Automated cron runner to check and send daily reports for all stores
 */
async function sendAutomatedDailyReports() {
  try {
    const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const nowBkkStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

    console.log(`[LINE Cron Check] Running scheduled check at ${nowBkkStr} (Date: ${todayBkk})...`);

    // Fetch active settings with enable_daily_report = 1
    const storesConfig = await db.all(`
      SELECT ls.*, s.name as store_name 
      FROM line_settings ls
      JOIN stores s ON ls.store_id = s.id
      WHERE ls.enable_daily_report = 1 
        AND ls.channel_access_token IS NOT NULL 
        AND ls.target_group_id IS NOT NULL
    `);

    for (const config of storesConfig) {
      // Check if already sent today
      if (config.last_daily_report_sent_date === todayBkk) {
        console.log(`[LINE Cron] Store ${config.store_name} (${config.store_id}) already received daily report today (${todayBkk}). Skipping.`);
        continue;
      }

      // Check if current time is >= daily_report_time (e.g. "22:00")
      const targetTime = config.daily_report_time || '22:00';
      if (nowBkkStr >= targetTime) {
        console.log(`[LINE Cron] Triggering daily sales report for store ${config.store_name} (${config.store_id}) at ${nowBkkStr} (Target: ${targetTime})...`);
        try {
          await sendDailySalesReport(config.store_id, false);
          console.log(`[LINE Cron] Report successfully sent for ${config.store_name}`);
        } catch (err) {
          console.error(`[LINE Cron] Failed to send report for ${config.store_id}:`, err.message);
        }
      } else {
        console.log(`[LINE Cron] Store ${config.store_name}: current time ${nowBkkStr} < target ${targetTime}. Not yet due.`);
      }
    }
  } catch (err) {
    console.error('[LINE Cron] sendAutomatedDailyReports error:', err.message);
  }
}

/**
 * Send approval request notification to LINE
 */
async function sendApprovalRequestNotification(approvalRequest) {
  const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [approvalRequest.store_id]);
  if (!settings || !settings.enable_approval_notifications || !settings.channel_access_token || !settings.target_group_id) {
    console.log('[LINE Service] Approval notification skipped: LINE not configured or disabled');
    return null;
  }

  const store = await db.get('SELECT name FROM stores WHERE id = ?', [approvalRequest.store_id]);
  approvalRequest.storeName = store?.name || 'POS สาขาหลัก';

  let payloadObj = {};
  if (approvalRequest.payload) {
    try {
      payloadObj = typeof approvalRequest.payload === 'string' ? JSON.parse(approvalRequest.payload) : approvalRequest.payload;
    } catch (_) {}
  }

  // Automatic database enrichment if items are not already in payload
  if (!payloadObj.items || payloadObj.items.length === 0) {
    try {
      if (approvalRequest.document_type === 'sale_void') {
        const order = await db.get(
          "SELECT id, order_no, total_amount, payment_method, debtor_name, remark FROM orders WHERE (order_no = ? OR id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [approvalRequest.document_id, approvalRequest.document_id, approvalRequest.store_id]
        );
        if (order) {
          payloadObj.payment_method = payloadObj.payment_method || order.payment_method;
          payloadObj.debtor_name = payloadObj.debtor_name || order.debtor_name;
          const items = await db.all(`
            SELECT oi.quantity, oi.unit_price, oi.total_price,
                   COALESCE(p.name, 'สินค้า') as name,
                   COALESCE(p.unit, 'ชิ้น') as unit
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
          `, [order.id]);
          payloadObj.items = items;
        }
      } else if (approvalRequest.document_type === 'po_cancel' || approvalRequest.document_type === 'goods_receipt') {
        const po = await db.get(
          "SELECT id, po_number, supplier_name, total_amount, received_date, remark FROM purchase_orders WHERE (po_number = ? OR id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [approvalRequest.document_id, approvalRequest.document_id, approvalRequest.store_id]
        );
        if (po) {
          payloadObj.supplier_name = payloadObj.supplier_name || po.supplier_name;
          payloadObj.received_date = payloadObj.received_date || po.received_date;
          const items = await db.all(`
            SELECT poi.quantity, poi.unit_cost_price, poi.total_price,
                   COALESCE(p.name, i.name, 'สินค้า/วัตถุดิบ') as name,
                   COALESCE(p.unit, i.unit, 'หน่วย') as unit
            FROM purchase_order_items poi
            LEFT JOIN products p ON poi.product_id = p.id
            LEFT JOIN ingredients i ON poi.product_id = i.id
            WHERE poi.po_id = ?
          `, [po.id]);
          payloadObj.items = items;
        }
      } else if (approvalRequest.document_type === 'wo_cancel' || approvalRequest.document_type === 'production_order') {
        const wo = await db.get(
          "SELECT id, wo_number, product_name, batch_count, produced_yield, yield_unit, total_cost, remark FROM work_orders WHERE (wo_number = ? OR id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = '')",
          [approvalRequest.document_id, approvalRequest.document_id, approvalRequest.store_id]
        );
        if (wo) {
          payloadObj.product_name = payloadObj.product_name || wo.product_name;
          payloadObj.produced_yield = payloadObj.produced_yield || wo.produced_yield;
          payloadObj.yield_unit = payloadObj.yield_unit || wo.yield_unit;
          payloadObj.batch_count = payloadObj.batch_count || wo.batch_count;
          payloadObj.total_cost = payloadObj.total_cost || wo.total_cost;
          const items = await db.all(`
            SELECT ingredient_name as name, quantity, unit, cost
            FROM work_order_items
            WHERE wo_id = ?
          `, [wo.id]);
          payloadObj.items = items;
        }
      }
    } catch (enrichErr) {
      console.warn('[LINE Service] Failed to enrich approval items from DB:', enrichErr.message);
    }
  }

  approvalRequest.payload = payloadObj;

  const flexMessage = buildApprovalRequestFlex(approvalRequest);
  return await pushMessage(settings.channel_access_token, settings.target_group_id, flexMessage);
}

module.exports = {
  verifySignature,
  pushMessage,
  replyMessage,
  sendTestMessage,
  getDailySalesStats,
  sendDailySalesReport,
  sendAutomatedDailyReports,
  sendApprovalRequestNotification
};
