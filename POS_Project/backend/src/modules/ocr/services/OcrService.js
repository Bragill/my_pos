const OcrRepository = require('../repositories/OcrRepository');
const StorageService = require('./StorageService');
const MockOcrProvider = require('../providers/MockOcrProvider');
const GeminiOcrProvider = require('../providers/GeminiOcrProvider');
const db = require('../../../database/dbHelper');
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    // Sharp is optional in serverless/edge environments
}

class OcrService {
    constructor() {
        this.providers = {
            mock: new MockOcrProvider(),
            gemini: new GeminiOcrProvider()
        };
    }

    async processUpload(user, file, storeId) {
        console.time(`Total Process ${file.originalname}`);
        
        let processedBuffer = file.buffer;
        let mimetype = file.mimetype;

        // --- Image Optimization for OCR & Storage ---
        if (sharp) {
            try {
                console.log('[OCR] Optimizing image...');
                const image = sharp(file.buffer).rotate();
                const metadata = await image.metadata();
                
                processedBuffer = await image
                    .resize({ width: 1800, withoutEnlargement: true, fit: 'inside' })
                    .modulate({ brightness: 1.05, contrast: 1.2 }) // Slightly boost contrast for text
                    .gamma(1.1) // Better tonal range for OCR
                    .jpeg({ 
                        quality: 82, 
                        progressive: true, 
                        optimizeScans: true 
                    })
                    .toBuffer();
                
                mimetype = 'image/jpeg';
                console.log(`[OCR] Image optimized: ${metadata.width}x${metadata.height} -> 1800w (max), Size: ${Math.round(processedBuffer.length / 1024)}KB`);
            } catch (error) {
                console.warn('[OCR] Optimization failed, using original:', error.message);
            }
        }

        // 1. Upload to Storage
        console.time(`Storage Upload ${file.originalname}`);
        const uploadResult = await StorageService.uploadImage(processedBuffer, mimetype);
        console.timeEnd(`Storage Upload ${file.originalname}`);

        // 2. Create record in DB
        const receipt = await OcrRepository.createReceipt({
            user_id: user.id,
            store_id: storeId,
            image_url: uploadResult.url,
            storage_key: uploadResult.key,
            status: 'processing'
        });

        // 3. Trigger OCR (using the already processed buffer for speed)
        this.runOcrTask(receipt.id, processedBuffer, mimetype, file.originalname);

        return receipt;
    }

    async runOcrTask(receiptId, buffer, mimetype, filename = 'unknown') {
        try {
            // Small delay to ensure DB record from processUpload is committed and visible
            await new Promise(r => setTimeout(r, 500));

            // Get receipt info for store_id
            const receipt = await OcrRepository.getReceiptById(receiptId);
            if (!receipt) throw new Error(`Receipt record ${receiptId} not found in DB`);

            const providerName = process.env.OCR_PROVIDER || 'gemini';
            const provider = this.providers[providerName];
            if (!provider) throw new Error(`OCR Provider ${providerName} not found`);

            console.log(`[OCR] Starting extraction for ${receiptId} (${filename}) using ${providerName}`);
            console.time(`AI Extraction ${receiptId}`);
            const data = await provider.extract(buffer, mimetype);
            console.timeEnd(`AI Extraction ${receiptId}`);

            if (!data) throw new Error('AI Provider returned no data');

            console.time(`DB Updates ${receiptId}`);
            
            // 1. Prepare items with product matching
            const itemsToInsert = [];
            if (Array.isArray(data.items)) {
                for (const item of data.items) {
                    let matchedProduct = null;
                    try {
                        matchedProduct = await this.findProductByName(item.raw_name, receipt.store_id);
                    } catch (e) {
                        console.warn(`[OCR] Product match failed for ${item.raw_name}:`, e.message);
                    }
                    
                    itemsToInsert.push({
                        ...item,
                        product_id: matchedProduct ? matchedProduct.id : null,
                        matched_name: matchedProduct ? matchedProduct.name : null
                    });
                }
            }

            // 2. Batch insert items FIRST
            if (itemsToInsert.length > 0) {
                await OcrRepository.createReceiptItems(receiptId, itemsToInsert);
            }

            // 3. Update main receipt status to completed LAST
            await OcrRepository.updateReceipt(receiptId, {
                status: 'completed',
                vendor_name: data.vendor_name || 'Unknown',
                receipt_date: data.receipt_date || null,
                total_amount: data.total_amount || 0,
                payment_method: data.payment_method || 'Unknown',
                transaction_id: data.transaction_id || null,
                structured_data: data
            });

            console.timeEnd(`DB Updates ${receiptId}`);
            console.timeEnd(`Total Process ${filename}`);

        } catch (error) {
            console.error(`OCR Task failed for ${receiptId}:`, error);
            // Ensure status is updated to failed on error
            try {
                await OcrRepository.updateReceipt(receiptId, {
                    status: 'failed',
                    error_message: error.message
                });
            } catch (updateError) {
                console.error(`Failed to set error status for ${receiptId}:`, updateError.message);
            }
        }
    }

    async updateStock(productId, quantity, receiptId, storeId) {
        const userSql = `SELECT user_id FROM ocr_receipts WHERE id = ?`;
        const row = await db.get(userSql, [receiptId]);
        if (!row) return;
        const { user_id } = row;

        // Check current inventory quantity
        const inv = await db.get(
            `SELECT quantity FROM inventory WHERE product_id = ? AND store_id = ?`,
            [productId, storeId]
        );
        const currentQty = inv ? parseInt(inv.quantity) : 0;

        // 1. Create Stock Transaction
        const txSql = `
            INSERT INTO stock_transactions (
                id, product_id, user_id, type, quantity, remark, store_id
            ) VALUES (?, ?, ?, 'receive', ?, ?, ?)
        `;
        await db.run(txSql, [
            require('uuid').v4(),
            productId,
            user_id,
            quantity,
            `OCR Receipt: ${receiptId}`,
            storeId
        ]);

        // 2. Update Inventory — replace (set) when current qty is 0, otherwise add
        if (currentQty === 0) {
            await db.run(
                `INSERT INTO inventory (product_id, store_id, quantity, updated_at)
                 VALUES (?, ?, ?, datetime('now', '+7 hours'))
                 ON CONFLICT(product_id, store_id) DO UPDATE SET
                 quantity = excluded.quantity,
                 updated_at = datetime('now', '+7 hours')`,
                [productId, storeId, quantity]
            );
        } else {
            await db.run(
                `INSERT INTO inventory (product_id, store_id, quantity, updated_at)
                 VALUES (?, ?, ?, datetime('now', '+7 hours'))
                 ON CONFLICT(product_id, store_id) DO UPDATE SET
                 quantity = inventory.quantity + excluded.quantity,
                 updated_at = datetime('now', '+7 hours')`,
                [productId, storeId, quantity]
            );
        }
    }

    async findProductByName(name, storeId) {
        // Simple case-insensitive search
        const sql = `SELECT id, name FROM products WHERE name LIKE ? AND store_id = ? LIMIT 1`;
        return await db.get(sql, [`%${name}%`, storeId]);
    }

    async getReceipt(id) {
        const receipt = await OcrRepository.getReceiptById(id);
        if (receipt && receipt.storage_key) {
            // Refresh URL if it's a private storage
            receipt.signed_url = await StorageService.getPresignedUrl(receipt.storage_key);
        }
        return receipt;
    }

    async listReceipts(storeId, query = {}) {
        const limit = parseInt(query.limit) || 20;
        const offset = parseInt(query.offset) || 0;
        return await OcrRepository.listReceipts(storeId, limit, offset);
    }

    async updateReceiptDetails(id, data) {
        const { items, ...receiptData } = data;
        
        // 1. Update main receipt
        await OcrRepository.updateReceipt(id, receiptData);

        // 2. Update items (Simple approach: delete and recreate for now)
        if (items) {
            await db.run(`DELETE FROM ocr_receipt_items WHERE receipt_id = ?`, [id]);
            for (const item of items) {
                await OcrRepository.createReceiptItem(id, item);
            }
        }

        return this.getReceipt(id);
    }

    async deleteReceipt(id) {
        console.log(`[OCR Service] Attempting to delete receipt: ${id}`);
        // 1. Get receipt to find the storage key
        const receipt = await OcrRepository.getReceiptById(id);
        if (!receipt) {
            console.warn(`[OCR Service] Receipt ${id} not found for deletion`);
            return;
        }

        // 2. Delete from R2
        if (receipt.storage_key) {
            console.log(`[OCR Service] Deleting storage key: ${receipt.storage_key}`);
            await StorageService.deleteImage(receipt.storage_key);
        }

        // 3. Delete from DB
        console.log(`[OCR Service] Deleting DB records for: ${id}`);
        await OcrRepository.deleteReceipt(id);
        console.log(`[OCR Service] Successfully deleted receipt: ${id}`);
    }

    async confirmStock(receiptId, storeId) {
        const receipt = await OcrRepository.getReceiptById(receiptId);
        if (!receipt) throw new Error('Receipt not found');

        for (const item of receipt.items) {
            if (item.product_id && parseInt(item.is_stock_updated) === 0) {
                await this.updateStock(item.product_id, item.quantity, receiptId, storeId);
                await db.run(`UPDATE ocr_receipt_items SET is_stock_updated = 1 WHERE id = ?`, [item.id]);
            }
        }
        
        return this.getReceipt(receiptId);
    }
}

module.exports = new OcrService();
