const express = require('express');
const multer = require('multer');
const OcrController = require('./controllers/OcrController');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('รองรับเฉพาะไฟล์รูปภาพเท่านั้น'), false);
        }
    }
});

// All OCR routes require authentication
router.use(authenticate);

router.post('/upload', upload.single('receipt'), OcrController.uploadReceipt);
router.get('/', OcrController.listReceipts);
router.get('/:id', OcrController.getReceipt);
router.put('/:id', OcrController.updateReceipt);
router.delete('/:id', OcrController.deleteReceipt);
router.post('/:id/confirm-stock', OcrController.confirmStock);

module.exports = router;
