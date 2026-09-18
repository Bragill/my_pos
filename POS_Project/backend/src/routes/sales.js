const express = require("express");
const db = require("../database/dbHelper");
const { authenticate, authorize } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const { isLineApprovalRequired, cancelSaleOrder } = require("../services/cancellationService");
const lineService = require("../services/lineService");
const router = express.Router();

/**
 * @route GET /api/orders/history
 * @desc Get sales history with filters
 */
router.get("/history", authenticate, async (req, res, next) => {
  try {
    const { 
      startDate, 
      endDate, 
      status, 
      paymentMethod, 
      search,
      page = 1,
      limit = 20
    } = req.query;

    let sql = `
      SELECT o.*, u.full_name as cashier_name,
             COALESCE(c.name, o.debtor_name) as customer_display_name,
             ar.status as ar_status,
             ar.created_at as ar_cancel_requested_at,
             ar.requester_name as ar_cancel_requester_name,
             ar.responded_at as ar_approved_at,
             ar.approver_name as ar_approver_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN (
        SELECT document_id, store_id, MAX(created_at) as created_at, MAX(responded_at) as responded_at, MAX(approver_name) as approver_name, MAX(requester_name) as requester_name, MAX(status) as status
        FROM approval_requests
        GROUP BY document_id, store_id
      ) ar ON (o.order_no = ar.document_id OR o.id = ar.document_id) AND o.store_id = ar.store_id
      WHERE o.store_id = ?
    `;
    const params = [req.store_id];

    // Let's debug log the parameters
    console.log("[Sales History] Fetching for store:", req.store_id, "Filters:", { startDate, endDate, status });

    if (startDate) {
      sql += " AND DATE(o.created_at) >= DATE(?)";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND DATE(o.created_at) <= DATE(?)";
      params.push(endDate);
    }
    if (status) {
      sql += " AND o.status = ?";
      params.push(status);
    }
    if (paymentMethod) {
      sql += " AND o.payment_method = ?";
      params.push(paymentMethod);
    }
    if (search) {
      sql += " AND (o.order_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const rows = await db.all(sql, params);
    const processedRows = (rows || []).map(row => {
      let currentStatus = row.status;
      if ((currentStatus === 'รออนุมัติ' || currentStatus === 'pending_approval') && row.ar_status === 'APPROVED') {
        currentStatus = 'ยกเลิกแล้ว';
        // Auto heal DB asynchronously
        db.run(
          "UPDATE orders SET status = 'ยกเลิกแล้ว', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')), updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [row.ar_approver_name || 'ผู้จัดการ', row.ar_approved_at, row.id]
        ).catch(() => {});
      }
      return {
        ...row,
        status: currentStatus,
        cancel_requested_at: row.cancel_requested_at || row.ar_cancel_requested_at || null,
        cancel_requester_name: row.cancel_requester_name || row.ar_cancel_requester_name || null,
        approved_at: row.approved_at || row.ar_approved_at || null,
        approver_name: row.approver_name || row.ar_approver_name || null
      };
    });
    
    // Total count for pagination
    let countSql = "SELECT COUNT(*) as count FROM orders WHERE store_id = ?";
    const countParams = [req.store_id];
    
    const countResult = await db.get(countSql, countParams);
    const totalCount = countResult?.count || 0;

    res.json({ 
      success: true, 
      data: processedRows, 
      pagination: {
        total: totalCount,
        page: parseInt(page), 
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (err) { next(err); }
});

/**
 * @route GET /api/orders/:id
 * @desc Get order details with items and audit logs
 */
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const order = await db.get(`
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ? AND o.store_id = ?
    `, [req.params.id, req.store_id]);

    if (!order) return next(new AppError("ไม่พบรายการขาย", 404));

    // Fallback cancel and approver info from approval_requests if not populated on orders
    const approval = await db.get(`
      SELECT status as approval_status, created_at as cancel_requested_at, responded_at as approval_responded_at, requester_name, approver_name
      FROM approval_requests
      WHERE (document_id = ? OR document_id = ?) AND store_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [order.order_no, order.id, req.store_id]);

    if (approval) {
      if ((order.status === 'รออนุมัติ' || order.status === 'pending_approval') && approval.approval_status === 'APPROVED') {
        order.status = 'ยกเลิกแล้ว';
        db.run(
          "UPDATE orders SET status = 'ยกเลิกแล้ว', approver_name = ?, approved_at = COALESCE(?, datetime('now', '+7 hours')), updated_at = datetime('now', '+7 hours') WHERE id = ?",
          [approval.approver_name || 'ผู้จัดการ', approval.approval_responded_at, order.id]
        ).catch(() => {});
      }
      if (!order.cancel_requested_at) order.cancel_requested_at = approval.cancel_requested_at;
      if (!order.cancel_requester_name) order.cancel_requester_name = approval.requester_name;
      if (!order.approved_at) order.approved_at = approval.approval_responded_at;
      if (!order.approver_name) order.approver_name = approval.approver_name;
    }

    const items = await db.all(`
      SELECT oi.*, p.name as product_name, p.sku, p.barcode
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [order.id]);

    const logs = await db.all(`
      SELECT l.*, u.full_name as user_name
      FROM sales_transaction_logs l
      JOIN users u ON l.user_id = u.id
      WHERE l.order_id = ?
      ORDER BY l.created_at DESC
    `, [order.id]);

    res.json({ success: true, data: { ...order, items, logs } });
  } catch (err) { next(err); }
});

/**
 * @route POST /api/orders/:id/void
 * @desc Void (cancel) an order
 */
router.post("/:id/void", authenticate, authorize("admin", "manager"), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return next(new AppError("กรุณาระบุเหตุผลในการยกเลิก", 400));

    const order = await db.get("SELECT * FROM orders WHERE (id = ? OR order_no = ?) AND store_id = ?", [req.params.id, req.params.id, req.store_id]);
    if (!order) return next(new AppError("ไม่พบรายการขาย", 404));
    if (order.status === "ยกเลิกแล้ว" || order.status === "refunded" || order.status === "voided") {
      return next(new AppError("รายการนี้ถูกยกเลิกไปแล้ว", 400));
    }
    if (order.status === "รออนุมัติ" || order.status === "pending_approval") {
      return next(new AppError("รายการนี้อยู่ระหว่างรอการอนุมัติผ่าน LINE", 400));
    }

    // Check if LINE approval is required for this store
    const lineRequired = await isLineApprovalRequired(req.store_id);

    if (lineRequired) {
      try { await db.run("ALTER TABLE orders ADD COLUMN cancel_requested_at TEXT"); } catch (_) {}
      try { await db.run("ALTER TABLE orders ADD COLUMN cancel_requester_name TEXT"); } catch (_) {}

      const requesterName = req.user.full_name || req.user.username || 'Staff';
      // 1. Update order status to 'รออนุมัติ'
      await db.run(
        "UPDATE orders SET status = 'รออนุมัติ', remark = COALESCE(remark || ' | ', '') || ?, cancel_requested_at = datetime('now', '+7 hours'), cancel_requester_name = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
        [`[รออนุมัติยกเลิก: ${reason}]`, requesterName, order.id]
      );

      // Check if there is already a pending request
      let approval = await db.get(
        "SELECT * FROM approval_requests WHERE document_id = ? AND store_id = ? AND status = 'PENDING'",
        [order.order_no || order.id, req.store_id]
      );

      if (!approval) {
        const orderItems = await db.all(`
          SELECT oi.quantity, oi.unit_price, oi.total_price,
                 COALESCE(p.name, 'สินค้า') as name,
                 COALESCE(p.unit, 'ชิ้น') as unit
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `, [order.id]);

        const approvalPayload = {
          items: orderItems,
          order_no: order.order_no,
          payment_method: order.payment_method,
          debtor_name: order.debtor_name,
          total_amount: order.total_amount
        };

        approval = {
          id: uuidv4(),
          store_id: req.store_id,
          document_type: 'sale_void',
          document_id: order.order_no || order.id,
          amount: parseFloat(order.total_amount) || 0,
          reason: reason || 'ขอยกเลิกบิลขาย',
          requester_id: req.user.id,
          requester_name: req.user.full_name || req.user.username || 'Staff',
          status: 'PENDING',
          payload: JSON.stringify(approvalPayload)
        };

        await db.run(`
          INSERT INTO approval_requests
          (id, store_id, document_type, document_id, amount, reason, requester_id, requester_name, status, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [
          approval.id,
          approval.store_id,
          approval.document_type,
          approval.document_id,
          approval.amount,
          approval.reason,
          approval.requester_id,
          approval.requester_name,
          approval.payload
        ]);

        try {
          await lineService.sendApprovalRequestNotification(approval);
        } catch (lineErr) {
          console.warn('[Sales Void] Failed to push notification to LINE:', lineErr.message);
        }
      }

      return res.json({
        success: true,
        requires_approval: true,
        message: 'ส่งคำขออนุมัติการยกเลิกบิลไปยัง LINE เรียบร้อยแล้ว กรุณารอผู้จัดการอนุมัติ',
        data: approval
      });
    }

    // Direct execution if LINE is not configured for this store
    const result = await cancelSaleOrder({
      orderId: order.id,
      storeId: req.store_id,
      requesterId: req.user.id,
      approverName: req.user.full_name || req.user.username || 'Admin/Manager',
      reason
    });

    res.json({
      success: true,
      requires_approval: false,
      message: result.message || "ยกเลิกรายการขายและคืนสต๊อกเรียบร้อยแล้ว",
      data: result
    });
  } catch (err) { next(err); }
});

module.exports = router;
