const OcrService = require('../services/OcrService');
const { AppError } = require('../../../middleware/errorHandler');

class OcrController {
    async uploadReceipt(req, res, next) {
        try {
            if (!req.file) {
                throw new AppError('กรุณาอัปโหลดรูปภาพใบเสร็จ', 400);
            }

            const receipt = await OcrService.processUpload(req.user, req.file, req.store_id);

            res.status(201).json({
                success: true,
                data: receipt
            });
        } catch (error) {
            next(error);
        }
    }

    async getReceipt(req, res, next) {
        try {
            const receipt = await OcrService.getReceipt(req.params.id);
            if (!receipt) {
                throw new AppError('ไม่พบข้อมูลใบเสร็จ', 404);
            }

            res.json({
                success: true,
                data: receipt
            });
        } catch (error) {
            next(error);
        }
    }

    async listReceipts(req, res, next) {
        try {
            const receipts = await OcrService.listReceipts(req.store_id, req.query);
            res.json({
                success: true,
                data: receipts
            });
        } catch (error) {
            next(error);
        }
    }

    async updateReceipt(req, res, next) {
        try {
            const receipt = await OcrService.updateReceiptDetails(req.params.id, req.body);
            res.json({
                success: true,
                data: receipt
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteReceipt(req, res, next) {
        try {
            console.log(`[OCR Controller] Deleting receipt: ${req.params.id}`);
            await OcrService.deleteReceipt(req.params.id);
            res.json({
                success: true,
                message: 'ลบข้อมูลใบเสร็จสำเร็จ'
            });
        } catch (error) {
            console.error(`[OCR Controller] Error deleting receipt:`, error);
            next(error);
        }
    }

    async confirmStock(req, res, next) {
        try {
            const receipt = await OcrService.confirmStock(req.params.id, req.store_id);
            res.json({
                success: true,
                data: receipt
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OcrController();
