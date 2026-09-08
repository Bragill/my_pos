const db = require('../database/dbHelper');

/**
 * Generate PO Number in YYYYMM0000 format (e.g. 2026090001)
 * Starts from 1 per month, 0-padded to 4 digits.
 * @param {string} storeId 
 * @returns {Promise<string>}
 */
async function generatePONumber(storeId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `${year}${month}`;

  // Find max PO number for current month & store
  const row = await db.get(
    `SELECT po_number FROM purchase_orders WHERE store_id = ? AND po_number LIKE ? ORDER BY po_number DESC LIMIT 1`,
    [storeId, `${prefix}%`]
  );

  let nextSeq = 1;
  if (row && row.po_number) {
    const seqStr = row.po_number.substring(6); // Extract number part after YYYYMM
    const currentSeq = parseInt(seqStr, 10);
    if (!isNaN(currentSeq)) {
      nextSeq = currentSeq + 1;
    }
  }

  const paddedSeq = String(nextSeq).padStart(4, '0');
  return `${prefix}${paddedSeq}`;
}

module.exports = { generatePONumber };
