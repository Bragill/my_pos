const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const { authenticate } = require('../middleware/auth');
const lineService = require('../services/lineService');
const { buildApprovalResultFlex } = require('../services/lineFlexTemplates');
const { executeApprovedAction } = require('../services/approvalService');
const { isLineApprovalRequired } = require('../services/cancellationService');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/approvals
 * List approval requests with filtering, pagination, and stats summary
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const storeId = req.query.store_id || req.store_id;
    const {
      type = 'all',
      status = 'all',
      startDate,
      endDate,
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Base conditions
    const conditions = ['store_id = ?'];
    const params = [storeId];

    if (type && type !== 'all') {
      conditions.push('document_type = ?');
      params.push(type);
    }

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status.toUpperCase());
    }

    if (startDate) {
      conditions.push("date(created_at) >= date(?)");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("date(created_at) <= date(?)");
      params.push(endDate);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(document_id LIKE ? OR requester_name LIKE ? OR approver_name LIKE ? OR reason LIKE ?)');
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Fetch paginated records
    const sql = `
      SELECT * FROM approval_requests
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.all(sql, [...params, limitNum, offset]);

    // Parse payload JSON safely
    const parsedRows = rows.map(row => {
      let parsedPayload = null;
      if (row.payload) {
        try {
          parsedPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        } catch (_) {
          parsedPayload = null;
        }
      }
      return {
        ...row,
        payload: parsedPayload
      };
    });

    // 2. Count total records for pagination
    const countSql = `SELECT COUNT(*) as total FROM approval_requests WHERE ${whereClause}`;
    const totalResult = await db.get(countSql, params);
    const total = totalResult?.total || 0;
    const totalPages = Math.ceil(total / limitNum);

    // 3. Store-wide Summary stats
    const summarySql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) as pending_amount
      FROM approval_requests
      WHERE store_id = ?
    `;
    const summary = await db.get(summarySql, [storeId]) || {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      pending_amount: 0
    };

    res.json({
      success: true,
      data: parsedRows,
      summary: {
        total: Number(summary.total) || 0,
        pending: Number(summary.pending) || 0,
        approved: Number(summary.approved) || 0,
        rejected: Number(summary.rejected) || 0,
        pending_amount: Number(summary.pending_amount) || 0
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/approvals/check-store-requirement
 * Checks if current store requires LINE approval
 */
router.get('/check-store-requirement', authenticate, async (req, res, next) => {
  try {
    const storeId = req.query.store_id || req.store_id;
    const required = await isLineApprovalRequired(storeId);
    res.json({ success: true, required, store_id: storeId });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/approvals/request
 * Create a new approval request and notify LINE
 */
router.post('/request', authenticate, async (req, res, next) => {
  try {
    const { document_type, document_id, amount = 0, reason = '', payload = null } = req.body;

    if (!document_type || !document_id) {
      return next(new AppError('document_type และ document_id จำเป็นต้องระบุ', 400));
    }

    // Check if there is already a pending request for this document
    const existing = await db.get(
      "SELECT * FROM approval_requests WHERE document_id = ? AND store_id = ? AND status = 'PENDING'",
      [document_id, req.store_id]
    );

    if (existing) {
      return res.json({
        success: true,
        message: 'มีคำขออนุมัตินี้รอการดำเนินการอยู่แล้ว',
        data: existing
      });
    }

    const payloadStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;

    const newApproval = {
      id: uuidv4(),
      store_id: req.store_id,
      document_type,
      document_id,
      amount: parseFloat(amount) || 0,
      reason: reason || 'คำขออนุมัติจากพนักงานหน้าร้าน',
      requester_id: req.user.id,
      requester_name: req.user.full_name || req.user.username || 'Staff',
      status: 'PENDING',
      payload: payloadStr
    };

    await db.run(`
      INSERT INTO approval_requests 
      (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `, [
      newApproval.id,
      newApproval.store_id,
      newApproval.document_type,
      newApproval.document_id,
      newApproval.amount,
      newApproval.reason,
      newApproval.requester_id,
      newApproval.requester_name,
      newApproval.payload
    ]);

    // Send LINE Flex Notification
    try {
      await lineService.sendApprovalRequestNotification(newApproval);
    } catch (lineErr) {
      console.warn('[Approvals] Failed to push notification to LINE:', lineErr.message);
    }

    res.json({
      success: true,
      message: 'สร้างคำขออนุมัติและส่งแจ้งเตือนเข้า LINE สำเร็จ',
      data: newApproval
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/approvals/:id/approve
 * Direct Web Approval by Manager / Admin
 */
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager') {
      return next(new AppError('คุณไม่มีสิทธิ์ในการอนุมัติคำขอนี้ (ต้องเป็น Admin หรือ Manager)', 403));
    }

    const approval = await db.get(
      'SELECT * FROM approval_requests WHERE id = ? AND store_id = ?',
      [req.params.id, req.store_id]
    );

    if (!approval) {
      return next(new AppError('ไม่พบรายการขออนุมัตินี้', 404));
    }

    if (approval.status !== 'PENDING') {
      return next(new AppError(`คำขอนี้ได้รับการดำเนินการไปแล้ว (${approval.status}) โดย ${approval.approver_name || 'ผู้อนุมัติ'}`, 400));
    }

    const approverName = req.user.full_name || req.user.username || 'ผู้จัดการ (Web)';
    const nowBkk = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // 1. Update approval request
    await db.run(
      "UPDATE approval_requests SET status = 'APPROVED', approver_name = ?, responded_at = datetime('now', '+7 hours') WHERE id = ?",
      [approverName, approval.id]
    );

    approval.status = 'APPROVED';
    approval.approver_name = approverName;

    // 2. Execute approved action
    try {
      await executeApprovedAction(approval);
    } catch (execErr) {
      console.error('[Web Approvals] executeApprovedAction error:', execErr.message);
      // Fallback status updates
      if (approval.document_type === 'sale_void') {
        await db.run(
          "UPDATE orders SET status = 'ยกเลิกแล้ว', approver_name = ?, approved_at = datetime('now', '+7 hours'), updated_at = datetime('now', '+7 hours') WHERE (id = ? OR order_no = ?)",
          [approverName, approval.document_id, approval.document_id]
        );
      } else if (approval.document_type === 'po_cancel' || approval.document_type === 'goods_receipt') {
        await db.run(
          "UPDATE purchase_orders SET status = 'cancelled', approver_name = ?, approved_at = datetime('now', '+7 hours') WHERE (id = ? OR po_number = ?)",
          [approverName, approval.document_id, approval.document_id]
        );
      } else if (approval.document_type === 'wo_cancel' || approval.document_type === 'production_order') {
        await db.run(
          "UPDATE work_orders SET status = 'cancelled', approver_name = ?, approved_at = datetime('now', '+7 hours') WHERE (id = ? OR wo_number = ?)",
          [approverName, approval.document_id, approval.document_id]
        );
      }
    }

    // 3. Notify LINE group of web approval
    try {
      const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [approval.store_id]);
      if (settings?.channel_access_token && settings?.target_group_id) {
        const resultFlex = buildApprovalResultFlex({
          documentId: approval.document_id,
          documentType: approval.document_type,
          status: 'APPROVED',
          responderName: `${approverName} (ผ่านเว็บ)`,
          respondedAt: nowBkk
        });
        await lineService.pushMessage(settings.channel_access_token, settings.target_group_id, resultFlex);
      }
    } catch (lineErr) {
      console.warn('[Web Approvals] Failed to notify LINE on approve:', lineErr.message);
    }

    res.json({
      success: true,
      message: `อนุมัติคำขอ ${approval.document_id} สำเร็จ`,
      data: approval
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/approvals/:id/reject
 * Direct Web Rejection by Manager / Admin
 */
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager') {
      return next(new AppError('คุณไม่มีสิทธิ์ในการปฏิเสธคำขอนี้ (ต้องเป็น Admin หรือ Manager)', 403));
    }

    const { reason: rejectReason = '' } = req.body;

    const approval = await db.get(
      'SELECT * FROM approval_requests WHERE id = ? AND store_id = ?',
      [req.params.id, req.store_id]
    );

    if (!approval) {
      return next(new AppError('ไม่พบรายการขออนุมัตินี้', 404));
    }

    if (approval.status !== 'PENDING') {
      return next(new AppError(`คำขอนี้ได้รับการดำเนินการไปแล้ว (${approval.status}) โดย ${approval.approver_name || 'ผู้อนุมัติ'}`, 400));
    }

    const approverName = req.user.full_name || req.user.username || 'ผู้จัดการ (Web)';
    const nowBkk = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // 1. Update approval request
    await db.run(
      "UPDATE approval_requests SET status = 'REJECTED', approver_name = ?, responded_at = datetime('now', '+7 hours') WHERE id = ?",
      [approverName, approval.id]
    );

    approval.status = 'REJECTED';
    approval.approver_name = approverName;

    // 2. Revert underlying document status
    try {
      const rejectNotice = `[ปฏิเสธยกเลิกโดย ${approverName} เมื่อ ${nowBkk}${rejectReason ? ': ' + rejectReason : ''}]`;
      if (approval.document_type === 'sale_void') {
        await db.run(
          "UPDATE orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR order_no = ?)",
          [rejectNotice, approval.document_id, approval.document_id]
        );
      } else if (approval.document_type === 'po_cancel' || approval.document_type === 'goods_receipt') {
        await db.run(
          "UPDATE purchase_orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ? WHERE (id = ? OR po_number = ?)",
          [rejectNotice, approval.document_id, approval.document_id]
        );
      } else if (approval.document_type === 'wo_cancel' || approval.document_type === 'production_order') {
        await db.run(
          "UPDATE work_orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ? WHERE (id = ? OR wo_number = ?)",
          [rejectNotice, approval.document_id, approval.document_id]
        );
      } else if (approval.document_type === 'device_unlock') {
        await db.run(
          "UPDATE device_security SET status = 'BLACKLISTED', updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
          [approval.document_id]
        );
      }
    } catch (rejErr) {
      console.error('[Web Approvals] Revert document status error:', rejErr.message);
    }

    // 3. Notify LINE group of web rejection
    try {
      const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [approval.store_id]);
      if (settings?.channel_access_token && settings?.target_group_id) {
        const resultFlex = buildApprovalResultFlex({
          documentId: approval.document_id,
          documentType: approval.document_type,
          status: 'REJECTED',
          responderName: `${approverName} (ผ่านเว็บ)`,
          respondedAt: nowBkk
        });
        await lineService.pushMessage(settings.channel_access_token, settings.target_group_id, resultFlex);
      }
    } catch (lineErr) {
      console.warn('[Web Approvals] Failed to notify LINE on reject:', lineErr.message);
    }

    res.json({
      success: true,
      message: `ปฏิเสธคำขอ ${approval.document_id} สำเร็จ`,
      data: approval
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/approvals/:id
 * Check single approval status (for polling)
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const row = await db.get('SELECT * FROM approval_requests WHERE id = ? AND store_id = ?', [req.params.id, req.store_id]);
    if (!row) return next(new AppError('ไม่พบคำขออนุมัติ', 404));

    let parsedPayload = null;
    if (row.payload) {
      try {
        parsedPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      } catch (_) {}
    }

    res.json({ success: true, data: { ...row, payload: parsedPayload } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/approvals/document/:document_id
 * Get approvals for a document
 */
router.get('/document/:document_id', authenticate, async (req, res, next) => {
  try {
    const rows = await db.all(
      'SELECT * FROM approval_requests WHERE document_id = ? AND store_id = ? ORDER BY created_at DESC',
      [req.params.document_id, req.store_id]
    );

    const parsedRows = rows.map(r => {
      let parsedPayload = null;
      if (r.payload) {
        try {
          parsedPayload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
        } catch (_) {}
      }
      return { ...r, payload: parsedPayload };
    });

    res.json({ success: true, data: parsedRows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

