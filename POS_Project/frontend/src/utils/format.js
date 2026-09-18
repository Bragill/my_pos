export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const decCount = (num.toString().split('.')[1] || '').length;
  const decimals = Math.min(4, Math.max(2, decCount));
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('th-TH').format(num);
}

// Stock quantity: integers shown cleanly (4, not 4.00),
// fractional values trimmed to max 2 decimals (59.5500...04 -> 59.55)
export function formatQty(qty) {
  const num = Number(qty) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  let d;
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(dateString.trim())) {
    d = new Date(dateString.trim().replace(' ', 'T') + '+07:00');
  } else {
    d = new Date(dateString);
  }

  if (isNaN(d.getTime())) return String(dateString);

  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(d);
}

export function formatShortDate(dateString) {
  if (!dateString) return '-';
  let d;
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(dateString.trim())) {
    d = new Date(dateString.trim().replace(' ', 'T') + '+07:00');
  } else {
    d = new Date(dateString);
  }

  if (isNaN(d.getTime())) return String(dateString);

  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(d);
}

/**
 * Auto calculates column widths based on maximum content length
 */
function getAutoColumnWidths(rows, headers) {
  return headers.map(header => {
    let maxLength = header.length * 1.5;
    for (const row of rows) {
      const val = row[header];
      if (val !== undefined && val !== null) {
        const strVal = String(val);
        if (strVal.length > maxLength) {
          maxLength = strVal.length;
        }
      }
    }
    return { wch: Math.min(Math.max(Math.ceil(maxLength + 3), 10), 60) };
  });
}

/**
 * Exports data to an Excel (.xlsx) file using SheetJS
 * Dynamically imports 'xlsx' to keep initial bundle size lean
 */
export async function exportToExcel({ filename = 'export', sheets = [] }) {
  if (!sheets || sheets.length === 0) {
    throw new Error('ไม่มีข้อมูลสำหรับการส่งออก Excel');
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ sheetName = 'Sheet1', data = [], columns }) => {
    let formattedData = [];

    if (columns && columns.length > 0) {
      formattedData = data.map(item => {
        const row = {};
        columns.forEach(col => {
          row[col.header] = item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : '';
        });
        return row;
      });
    } else {
      formattedData = data;
    }

    if (formattedData.length === 0) {
      const emptyData = columns ? [columns.reduce((acc, col) => ({ ...acc, [col.header]: '-' }), {})] : [{ 'ข้อความ': 'ไม่มีข้อมูลในช่วงเวลาที่เลือก' }];
      const worksheet = XLSX.utils.json_to_sheet(emptyData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const headers = Object.keys(formattedData[0]);
    worksheet['!cols'] = getAutoColumnWidths(formattedData, headers);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  });

  const finalFileName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, finalFileName);
}

export const EXCEL_COLUMNS = {
  SO_ITEMS: [
    { header: 'เลขที่บิล (SO)', key: 'order_no' },
    { header: 'วันที่ขาย', key: 'order_date' },
    { header: 'วันเวลา', key: 'order_datetime' },
    { header: 'สถานะ', key: 'order_status' },
    { header: 'วิธีชำระเงิน', key: 'payment_method' },
    { header: 'แคชเชียร์/ผู้ขาย', key: 'cashier_name' },
    { header: 'ลูกค้า', key: 'customer_name' },
    { header: 'รหัสสินค้า (SKU)', key: 'sku' },
    { header: 'ชื่อสินค้า', key: 'product_name' },
    { header: 'จำนวน', key: 'quantity' },
    { header: 'หน่วยนับ', key: 'unit' },
    { header: 'ราคาต่อหน่วย (฿)', key: 'unit_price' },
    { header: 'ส่วนลดรายการ (฿)', key: 'item_discount' },
    { header: 'ยอดรวมรายการ (฿)', key: 'item_total' },
    { header: 'ยอดรวมทั้งบิล (฿)', key: 'order_total_amount' }
  ],
  PO_ITEMS: [
    { header: 'เลขที่ใบสั่งซื้อ (PO)', key: 'po_number' },
    { header: 'วันที่สั่ง/รับสินค้า', key: 'po_date' },
    { header: 'วันเวลาบันทึก', key: 'po_datetime' },
    { header: 'สถานะ', key: 'po_status' },
    { header: 'วิธีชำระเงิน', key: 'payment_method' },
    { header: 'ธนาคาร/ช่องทาง', key: 'bank_name' },
    { header: 'ผู้ทำรายการ', key: 'user_name' },
    { header: 'ประเภทรายการ', key: 'item_type' },
    { header: 'รหัสสินค้า/วัตถุดิบ (SKU)', key: 'sku' },
    { header: 'ชื่อรายการ', key: 'item_name' },
    { header: 'จำนวน', key: 'quantity' },
    { header: 'หน่วยนับ', key: 'unit' },
    { header: 'ต้นทุนต่อหน่วย (฿)', key: 'unit_cost_price' },
    { header: 'ยอดรวมรายการ (฿)', key: 'item_total' },
    { header: 'ยอดรวมทั้งใบ PO (฿)', key: 'po_grand_total' },
    { header: 'หมายเหตุ', key: 'po_notes' }
  ],
  WO_ITEMS: [
    { header: 'เลขที่ใบสั่งผลิต (WO)', key: 'wo_number' },
    { header: 'วันที่ผลิต', key: 'production_date' },
    { header: 'วันเวลาที่ผลิต', key: 'production_datetime' },
    { header: 'สถานะ', key: 'wo_status' },
    { header: 'ผู้บันทึกการผลิต', key: 'user_name' },
    { header: 'รหัสสินค้าสำเร็จรูป', key: 'output_product_sku' },
    { header: 'ชื่อสินค้าสำเร็จรูป', key: 'output_product_name' },
    { header: 'จำนวน Batch', key: 'batch_count' },
    { header: 'ยอดผลิตได้จริง', key: 'produced_yield' },
    { header: 'หน่วยสินค้า', key: 'yield_unit' },
    { header: 'ต้นทุนการผลิตรวม (฿)', key: 'wo_total_cost' },
    { header: 'ต้นทุนต่อหน่วย (฿)', key: 'wo_unit_cost' },
    { header: 'วันหมดอายุ Batch', key: 'batch_expiry_date' },
    { header: 'รหัสวัตถุดิบที่ใช้', key: 'ingredient_sku' },
    { header: 'ชื่อวัตถุดิบที่ใช้', key: 'ingredient_name' },
    { header: 'จำนวนวัตถุดิบที่ใช้', key: 'ingredient_used_quantity' },
    { header: 'หน่วยวัตถุดิบ', key: 'ingredient_unit' },
    { header: 'ต้นทุนวัตถุดิบต่อหน่วย (฿)', key: 'ingredient_unit_cost' },
    { header: 'ต้นทุนวัตถุดิบรวม (฿)', key: 'ingredient_total_cost' },
    { header: 'หมายเหตุ', key: 'wo_remark' }
  ]
};

