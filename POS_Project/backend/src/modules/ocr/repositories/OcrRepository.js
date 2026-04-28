const db = require('../../../database/dbHelper');
const { v4: uuidv4 } = require('uuid');

class OcrRepository {
    async createReceipt(data) {
        const id = uuidv4();
        const sql = `
            INSERT INTO ocr_receipts (
                id, store_id, user_id, image_url, storage_key, status
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
            id, 
            data.store_id || null, 
            data.user_id, 
            data.image_url, 
            data.storage_key, 
            data.status || 'pending'
        ];
        db.run(sql, params);
        return this.getReceiptById(id);
    }

    async getReceiptById(id) {
        const sql = `SELECT * FROM ocr_receipts WHERE id = ?`;
        const receipt = db.get(sql, [id]);
        if (receipt) {
            receipt.items = await this.getReceiptItems(id);
        }
        return receipt;
    }

    async updateReceipt(id, data) {
        const fields = [];
        const params = [];
        
        data.updated_at = new Date().toISOString();

        for (const [key, value] of Object.entries(data)) {
            if (key === 'id') continue;
            fields.push(`${key} = ?`);
            params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        }

        params.push(id);
        const sql = `UPDATE ocr_receipts SET ${fields.join(', ')} WHERE id = ?`;
        db.run(sql, params);
        return this.getReceiptById(id);
    }

    async getReceiptItems(receiptId) {
        const sql = `SELECT * FROM ocr_receipt_items WHERE receipt_id = ?`;
        return db.all(sql, [receiptId]);
    }

    async createReceiptItem(receiptId, item) {
        const id = uuidv4();
        const sql = `
            INSERT INTO ocr_receipt_items (
                id, receipt_id, product_id, raw_name, matched_name, 
                quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            id,
            receiptId,
            item.product_id || null,
            item.raw_name,
            item.matched_name || null,
            item.quantity || 1,
            item.unit_price || 0,
            item.total_price || 0
        ];
        db.run(sql, params);
        return id;
    }

    async listReceipts(storeId, limit = 20, offset = 0) {
        const sql = `
            SELECT * FROM ocr_receipts 
            WHERE store_id = ? OR store_id IS NULL
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        return db.all(sql, [storeId, limit, offset]);
    }

    async deleteReceipt(id) {
        try {
            console.log(`[OCR Repository] Deleting receipt record: ${id}`);
            const deleteReceiptSql = `DELETE FROM ocr_receipts WHERE id = ?`;
            const result = db.run(deleteReceiptSql, [id]);
            console.log(`[OCR Repository] Deleted ${result.changes} receipt record(s)`);
            
            return result.changes > 0;
        } catch (error) {
            console.error(`[OCR Repository] Delete failed for ${id}:`, error);
            throw error;
        }
    }
}

module.exports = new OcrRepository();
