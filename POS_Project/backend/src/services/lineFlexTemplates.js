/**
 * LINE Messaging API Flex Message Templates
 */

function formatCurrency(amount) {
  return '฿' + Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildDailySalesReportFlex({
  storeName = 'POS Store',
  dateStr = new Date().toLocaleDateString('th-TH'),
  totalSales = 0,
  totalOrders = 0,
  voidCount = 0,
  voidAmount = 0,
  paymentBreakdown = {},
  topProducts = []
}) {
  const paymentRows = Object.entries(paymentBreakdown).map(([method, amt]) => {
    let methodLabel = method;
    if (method.toLowerCase() === 'cash') methodLabel = '💵 เงินสด';
    else if (method.toLowerCase() === 'promptpay' || method.toLowerCase() === 'qr') methodLabel = '📱 พร้อมเพย์ / QR';
    else if (method.toLowerCase() === 'credit_card' || method.toLowerCase() === 'credit') methodLabel = '💳 บัตรเครดิต';
    else if (method.toLowerCase() === 'debtor') methodLabel = '📝 ค้างชำระ/ลูกหนี้';

    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: methodLabel, size: 'sm', color: '#555555', flex: 2 },
        { type: 'text', text: formatCurrency(amt), size: 'sm', color: '#111111', align: 'end', flex: 1, weight: 'bold' }
      ]
    };
  });

  const topProductRows = topProducts.slice(0, 5).map((p, idx) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: (idx + 1) + '. ' + (p.name || 'สินค้า'), size: 'sm', color: '#555555', flex: 3, wrap: true },
      { type: 'text', text: 'x' + (p.quantity || 0), size: 'sm', color: '#777777', align: 'center', flex: 1 },
      { type: 'text', text: formatCurrency(p.total), size: 'sm', color: '#111111', align: 'end', flex: 2, weight: 'bold' }
    ]
  }));

  return {
    type: 'flex',
    altText: '📊 สรุปยอดขายประจำวัน (' + dateStr + ') - ' + formatCurrency(totalSales),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '📊 สรุปยอดขายประจำวัน', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: storeName + ' • ' + dateStr, color: '#E8F5E9', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F7F9FA',
            cornerRadius: 'md',
            paddingAll: '12px',
            alignItems: 'center',
            contents: [
              { type: 'text', text: 'ยอดขายรวมสุทธิ', size: 'xs', color: '#888888' },
              { type: 'text', text: formatCurrency(totalSales), size: 'xxl', weight: 'bold', color: '#06C755', margin: 'xs' },
              { type: 'text', text: 'จำนวน ' + totalOrders + ' ออเดอร์ (เฉลี่ย ' + formatCurrency(totalOrders > 0 ? totalSales / totalOrders : 0) + '/บิล)', size: 'xs', color: '#555555', margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '💳 ช่องทางการชำระเงิน', size: 'sm', weight: 'bold', color: '#333333' },
              ...(paymentRows.length > 0 ? paymentRows : [
                { type: 'text', text: 'ไม่มีรายการชำระเงิน', size: 'xs', color: '#999999' }
              ])
            ]
          },
          { type: 'separator', margin: 'md' },
          ...(topProductRows.length > 0 ? [
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                { type: 'text', text: '🏆 5 สินค้าขายดี', size: 'sm', weight: 'bold', color: '#333333' },
                ...topProductRows
              ]
            },
            { type: 'separator', margin: 'md' }
          ] : []),
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: '❌ รายการยกเลิก (Void):', size: 'xs', color: '#888888', flex: 2 },
              { type: 'text', text: voidCount + ' บิล (' + formatCurrency(voidAmount) + ')', size: 'xs', color: voidCount > 0 ? '#E53935' : '#888888', align: 'end', flex: 2, weight: 'bold' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: 'POS Cloudflare Workers System', size: 'xxs', color: '#AAAAAA', align: 'center' }
        ]
      }
    }
  };
}

function buildApprovalRequestFlex(request) {
  let docTypeLabel = 'คำขออนุมัติ';
  let badgeColor = '#D97706';

  let payload = null;
  if (request.payload) {
    try {
      payload = typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;
    } catch (_) {}
  }

  const isSaleVoid = request.document_type === 'sale_void';
  const isPO = request.document_type === 'po_cancel' || request.document_type === 'goods_receipt';
  const isWorkOrder = request.document_type === 'wo_cancel' || request.document_type === 'production_order';
  const isStockAdjust = request.document_type === 'stock_adjust';
  const isDeviceUnlock = request.document_type === 'device_unlock';

  if (isSaleVoid) {
    docTypeLabel = '⚠️ ขอยกเลิกบิลขาย (Void Order)';
    badgeColor = '#DC2626';
  } else if (isPO) {
    docTypeLabel = '📦 ขอยกเลิกใบสั่งซื้อ/รับสินค้า (Cancel PO)';
    badgeColor = '#D97706';
  } else if (isWorkOrder) {
    docTypeLabel = '🏭 ขอยกเลิกใบสั่งผลิต (Cancel WO)';
    badgeColor = '#7C3AED';
  } else if (isStockAdjust) {
    docTypeLabel = '🔧 ขอปรับปรุงสต็อก (Stock Adjustment)';
    badgeColor = '#0284C7';
  } else if (isDeviceUnlock) {
    docTypeLabel = '🚨 แจ้งเตือนความปลอดภัย: ล็อกอุปกรณ์';
    badgeColor = '#B91C1C';
  }

  const headerSubtitle = isDeviceUnlock
    ? `MAC: ${request.document_id}`
    : isStockAdjust
    ? (payload?.product_name ? `${payload.product_name}${payload.product_sku ? ` (${payload.product_sku})` : ''}` : `รหัส #${request.document_id}`)
    : isSaleVoid
    ? `บิลขาย #${request.document_id}`
    : isPO
    ? `ใบรับสินค้า #${request.document_id}`
    : isWorkOrder
    ? `ใบสั่งผลิต #${request.document_id}`
    : `เอกสาร #${request.document_id}`;

  // 1. General detail rows
  const detailRows = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'สาขา:', size: 'xs', color: '#64748B', flex: 2 },
        { type: 'text', text: request.storeName || 'ระบบ POS ส่วนกลาง', size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
      ]
    },
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: isDeviceUnlock ? 'เป้าหมาย:' : 'ผู้ขออนุมัติ:', size: 'xs', color: '#64748B', flex: 2 },
        { type: 'text', text: request.requester_name || (isDeviceUnlock ? 'ระบบรักษาความปลอดภัยอัตโนมัติ' : 'พนักงานหน้าร้าน'), size: 'xs', color: '#0F172A', flex: 5 }
      ]
    }
  ];

  if (isDeviceUnlock) {
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'MAC Address:', size: 'xs', color: '#B91C1C', flex: 3, weight: 'bold' },
        { type: 'text', text: payload?.mac_address || request.document_id, size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
      ]
    });
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'IP Address:', size: 'xs', color: '#64748B', flex: 3 },
        { type: 'text', text: payload?.ip_address || 'ไม่ระบุ', size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
      ]
    });
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'พิกัด/ตำแหน่ง:', size: 'xs', color: '#64748B', flex: 3 },
        { type: 'text', text: payload?.location || 'Bangkok, Thailand', size: 'xs', color: '#0F172A', flex: 5 }
      ]
    });
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'สาเหตุที่ระงับ:', size: 'xs', color: '#64748B', flex: 3 },
        { type: 'text', text: request.reason || payload?.locked_reason || 'ตรวจพบพฤติกรรมผิดปกติ', size: 'xs', color: '#B91C1C', flex: 5, weight: 'bold', wrap: true }
      ]
    });
  }

  if (isSaleVoid) {
    let methodLabel = payload?.payment_method;
    if (methodLabel) {
      if (methodLabel.toLowerCase() === 'cash') methodLabel = '💵 เงินสด';
      else if (methodLabel.toLowerCase() === 'promptpay' || methodLabel.toLowerCase() === 'qr') methodLabel = '📱 พร้อมเพย์ / QR';
      else if (methodLabel.toLowerCase() === 'credit_card' || methodLabel.toLowerCase() === 'credit') methodLabel = '💳 บัตรเครดิต';
      else if (methodLabel.toLowerCase() === 'debtor') methodLabel = `📝 ลูกหนี้ (${payload?.debtor_name || 'ค้างชำระ'})`;
      detailRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'ชำระโดย:', size: 'xs', color: '#64748B', flex: 2 },
          { type: 'text', text: methodLabel, size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
        ]
      });
    }
  } else if (isPO) {
    if (payload?.supplier_name) {
      detailRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'ผู้ขาย/Supplier:', size: 'xs', color: '#64748B', flex: 2 },
          { type: 'text', text: payload.supplier_name, size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
        ]
      });
    }
  } else if (isWorkOrder) {
    if (payload?.product_name) {
      detailRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'สินค้าที่ผลิต:', size: 'xs', color: '#64748B', flex: 2 },
          { type: 'text', text: payload.product_name, size: 'xs', color: '#7C3AED', flex: 5, weight: 'bold' }
        ]
      });
    }
    if (payload?.produced_yield) {
      detailRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'ยอดผลิต:', size: 'xs', color: '#64748B', flex: 2 },
          { type: 'text', text: `${payload.produced_yield} ${payload.yield_unit || 'หน่วย'} (${payload.batch_count || 1} Batch)`, size: 'xs', color: '#0F172A', flex: 5, weight: 'bold' }
        ]
      });
    }
  } else if (isStockAdjust) {
    if (payload?.product_name) {
      detailRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'สินค้า:', size: 'xs', color: '#64748B', flex: 2 },
          { type: 'text', text: payload.product_name, size: 'xs', color: '#0F172A', flex: 5, weight: 'bold', wrap: true }
        ]
      });
    }
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'การปรับ:', size: 'xs', color: '#64748B', flex: 2 },
        { 
          type: 'text', 
          text: `${(payload?.diff > 0 ? '+' : '') + (payload?.diff ?? '')} ${payload?.unit || 'ชิ้น'} (${payload?.previous_quantity ?? '-'} → ${payload?.target_quantity ?? '-'})`, 
          size: 'xs', 
          color: (payload?.diff < 0) ? '#DC2626' : '#16A34A', 
          weight: 'bold', 
          flex: 5 
        }
      ]
    });
  }

  if (!isDeviceUnlock) {
    detailRows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'เหตุผล:', size: 'xs', color: '#64748B', flex: 2 },
        { type: 'text', text: request.reason || '-', size: 'xs', color: '#334155', wrap: true, flex: 5 }
      ]
    });
  }

  // 2. Items List section (For PO, SO, WO)
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const itemRows = items.slice(0, 6).map((item, idx) => {
    const itemName = item.name || item.ingredient_name || item.product_name || `รายการที่ ${idx + 1}`;
    const qty = parseFloat(item.quantity) || 0;
    const unitStr = item.unit ? ` ${item.unit}` : '';
    const qtyText = `x${qty}${unitStr}`;

    const priceVal = item.total_price !== undefined && item.total_price !== null 
      ? item.total_price 
      : (item.total_cost !== undefined && item.total_cost !== null 
          ? item.total_cost 
          : item.cost);
    const priceText = priceVal !== undefined && priceVal !== null ? formatCurrency(priceVal) : '';

    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `${idx + 1}. ${itemName}`,
          size: 'xs',
          color: '#1E293B',
          weight: 'bold',
          flex: 5,
          wrap: true
        },
        {
          type: 'text',
          text: qtyText,
          size: 'xs',
          color: '#64748B',
          align: 'end',
          flex: 3
        },
        ...(priceText ? [{
          type: 'text',
          text: priceText,
          size: 'xs',
          color: '#0F172A',
          align: 'end',
          weight: 'bold',
          flex: 3
        }] : [])
      ]
    };
  });

  const itemsSection = itemRows.length > 0 ? [
    { type: 'separator', margin: 'md' },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: isWorkOrder
            ? `🥣 วัตถุดิบที่ใช้ตัดสต็อก (${items.length} รายการ):`
            : isPO
            ? `📦 รายการวัตถุดิบ/สินค้าที่รับเข้า (${items.length} รายการ):`
            : `🛒 รายการสินค้าในบิล (${items.length} รายการ):`,
          size: 'xs',
          weight: 'bold',
          color: '#334155'
        },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          cornerRadius: 'md',
          paddingAll: '10px',
          spacing: 'sm',
          margin: 'xs',
          contents: [
            ...itemRows,
            ...(items.length > 6 ? [
              {
                type: 'text',
                text: `... และอีก ${items.length - 6} รายการ`,
                size: 'xxs',
                color: '#94A3B8',
                align: 'center',
                margin: 'xs'
              }
            ] : [])
          ]
        }
      ]
    }
  ] : [];

  // 3. Highlight Total / Security Alert Card
  let totalHighlightCard;
  if (isDeviceUnlock) {
    totalHighlightCard = {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF2F2',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'md',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: 'สถานะความปลอดภัย (Security Alert)',
          size: 'xs',
          color: '#991B1B',
          weight: 'bold'
        },
        {
          type: 'text',
          text: payload?.is_bot ? '🚨 บอท / สคริปต์อัตโนมัติ (ตรวจพบความผิดปกติ)' : '🔒 ใส่รหัสผิดเกินกำหนด (ระงับถาวร)',
          size: 'sm',
          weight: 'bold',
          color: '#DC2626',
          margin: 'xs'
        }
      ]
    };
  } else {
    const totalAmountNum = parseFloat(request.amount) || parseFloat(payload?.total_cost) || 0;
    totalHighlightCard = {
      type: 'box',
      layout: 'vertical',
      backgroundColor: isSaleVoid ? '#FEF2F2' : isPO ? '#FFFBEB' : isWorkOrder ? '#F5F3FF' : '#F0F9FF',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'md',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: isSaleVoid
            ? 'ยอดเงินที่ขอยกเลิก (Void Amount)'
            : isPO
            ? 'มูลค่าสั่งซื้อรวม (PO Amount)'
            : isWorkOrder
            ? 'ต้นทุนการผลิตรวมทั้ง Batch'
            : 'ผลกระทบการปรับสต็อก',
          size: 'xs',
          color: '#64748B',
          weight: 'bold'
        },
        {
          type: 'text',
          text: formatCurrency(totalAmountNum),
          size: 'xl',
          weight: 'bold',
          color: isSaleVoid ? '#DC2626' : isPO ? '#D97706' : isWorkOrder ? '#7C3AED' : '#0284C7',
          margin: 'xs'
        }
      ]
    };
  }

  return {
    type: 'flex',
    altText: '🔔 ' + docTypeLabel + ' - ' + headerSubtitle,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: badgeColor,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: docTypeLabel, color: '#FFFFFF', weight: 'bold', size: 'md' },
          { type: 'text', text: headerSubtitle, color: '#FFFFFF', size: 'sm', margin: 'xs', weight: 'bold', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'xs',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: detailRows
          },
          ...itemsSection,
          totalHighlightCard,
          {
            type: 'text',
            text: isDeviceUnlock
              ? 'แตะปุ่มด้านล่างเพื่อปลดล็อกหรือแบนอุปกรณ์นี้ถาวร'
              : 'กรุณาตรวจสอบข้อมูลและแตะปุ่มด้านล่างเพื่อดำเนินการทันที',
            size: 'xxs',
            color: '#94A3B8',
            align: 'center',
            margin: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            height: 'sm',
            action: {
              type: 'postback',
              label: isDeviceUnlock ? '✅ ปลดล็อก' : '✅ อนุมัติ',
              data: 'action=approve&id=' + request.id + '&doc=' + request.document_id + '&type=' + request.document_type,
              displayText: isDeviceUnlock
                ? 'ฉันขออนุมัติปลดล็อกอุปกรณ์ ' + request.document_id
                : 'ฉันขออนุมัติเอกสาร #' + request.document_id
            }
          },
          {
            type: 'button',
            style: 'secondary',
            color: '#F44336',
            height: 'sm',
            action: {
              type: 'postback',
              label: isDeviceUnlock ? '⛔ แบนถาวร' : '❌ ไม่อนุมัติ',
              data: 'action=reject&id=' + request.id + '&doc=' + request.document_id + '&type=' + request.document_type,
              displayText: isDeviceUnlock
                ? 'ฉันปฏิเสธและแบนอุปกรณ์ ' + request.document_id
                : 'ฉันไม่อนุมัติเอกสาร #' + request.document_id
            }
          }
        ]
      }
    }
  };
}

function buildApprovalResultFlex({
  documentId,
  documentType,
  status,
  responderName,
  respondedAt = new Date().toLocaleTimeString('th-TH')
}) {
  const isApproved = status === 'APPROVED';
  const isDeviceUnlock = documentType === 'device_unlock';
  const color = isApproved ? '#06C755' : '#E53935';
  const statusLabel = isApproved 
    ? (isDeviceUnlock ? 'ปลดล็อกอุปกรณ์แล้ว ✅' : 'อนุมัติเรียบร้อยแล้ว ✅')
    : (isDeviceUnlock ? 'ระงับอุปกรณ์ถาวรแล้ว ⛔' : 'ปฏิเสธคำขอแล้ว ❌');

  return {
    type: 'flex',
    altText: '📢 ผลการอนุมัติ #' + documentId + ': ' + statusLabel,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: '12px',
        contents: [
          { type: 'text', text: statusLabel, color: '#FFFFFF', weight: 'bold', size: 'md' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'xs',
        contents: [
          { type: 'text', text: isDeviceUnlock ? ('อุปกรณ์: ' + documentId) : ('เอกสาร: #' + documentId), size: 'sm', weight: 'bold' },
          { type: 'text', text: 'ดำเนินการโดย: ' + (responderName || 'ผู้มีอำนาจอนุมัติ'), size: 'xs', color: '#666666' },
          { type: 'text', text: 'เวลา: ' + respondedAt, size: 'xs', color: '#999999' }
        ]
      }
    }
  };
}

module.exports = {
  formatCurrency,
  buildDailySalesReportFlex,
  buildApprovalRequestFlex,
  buildApprovalResultFlex
};
