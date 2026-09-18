const db = require('../database/dbHelper');
const {
  cancelSaleOrder,
  cancelPurchaseOrder,
  cancelWorkOrder,
  executeStockAdjustment
} = require('./cancellationService');

/**
 * Execute approved action based on document type
 */
async function executeApprovedAction(approval) {
  const { document_type, document_id, store_id, approver_name, reason } = approval;

  // Check if simulated test document
  if (document_id && String(document_id).startsWith('TEST-')) {
    return { success: true, message: `ทดสอบระบบอนุมัติสำเร็จ สำหรับบิลจำลอง #${document_id}` };
  }

  if (document_type === 'sale_void') {
    return await cancelSaleOrder({
      orderId: document_id,
      storeId: store_id,
      requesterId: approval.requester_id || 'system',
      approverName: approver_name || 'LINE Manager',
      reason: reason || 'อนุมัติการยกเลิกผ่าน LINE'
    });
  } else if (document_type === 'po_cancel' || document_type === 'goods_receipt') {
    return await cancelPurchaseOrder({
      poId: document_id,
      storeId: store_id,
      requesterId: approval.requester_id || 'system',
      approverName: approver_name || 'LINE Manager',
      reason: reason || 'อนุมัติการยกเลิก PO ผ่าน LINE'
    });
  } else if (document_type === 'wo_cancel' || document_type === 'production_order') {
    return await cancelWorkOrder({
      woId: document_id,
      storeId: store_id,
      requesterId: approval.requester_id || 'system',
      approverName: approver_name || 'LINE Manager',
      reason: reason || 'อนุมัติการยกเลิก WO ผ่าน LINE'
    });
  } else if (document_type === 'stock_adjust') {
    let payload = null;
    if (approval.payload) {
      try {
        payload = typeof approval.payload === 'string' ? JSON.parse(approval.payload) : approval.payload;
      } catch (_) {}
    }
    const productId = payload?.product_id || document_id;
    return await executeStockAdjustment({
      storeId: store_id,
      productId,
      diff: payload?.diff,
      targetQuantity: payload?.target_quantity,
      reason: reason || approval.reason,
      requesterId: approval.requester_id || 'system',
      approverName: approver_name || 'LINE Manager'
    });
  } else if (document_type === 'device_unlock') {
    const mac = document_id;
    await db.run(
      "UPDATE device_security SET status = 'WHITELISTED', failed_attempts = 0, lock_until = NULL, updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
      [mac]
    );
    return { success: true, message: `ปลดล็อคและอนุญาต (Whitelist) อุปกรณ์ ${mac} เรียบร้อยแล้ว` };
  }

  return { success: true, message: 'บันทึกการอนุมัติเรียบร้อย' };
}

module.exports = {
  executeApprovedAction
};
