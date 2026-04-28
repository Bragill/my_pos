-- Migration: Add OCR module tables
-- Tables for Receipt OCR and Stock Automation

CREATE TABLE IF NOT EXISTS ocr_receipts (
    id TEXT PRIMARY KEY, -- UUID string
    store_id TEXT, -- Relation to stores
    user_id TEXT, -- Relation to users
    image_url TEXT NOT NULL,
    storage_key TEXT NOT NULL, -- R2 key
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    raw_ocr_data TEXT, -- JSON string from provider
    structured_data TEXT, -- JSON string (ReceiptData schema)
    total_amount NUMERIC(12, 2),
    vendor_name TEXT,
    receipt_date TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ocr_receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    product_id TEXT, -- Linked product (if matched)
    raw_name TEXT NOT NULL,
    matched_name TEXT,
    quantity REAL DEFAULT 1,
    unit_price NUMERIC(12, 2),
    total_price NUMERIC(12, 2),
    is_stock_updated INTEGER DEFAULT 0, -- 0: false, 1: true
    FOREIGN KEY (receipt_id) REFERENCES ocr_receipts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ocr_receipts_store ON ocr_receipts(store_id);
CREATE INDEX IF NOT EXISTS idx_ocr_receipts_status ON ocr_receipts(status);
CREATE INDEX IF NOT EXISTS idx_ocr_receipt_items_receipt ON ocr_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_ocr_receipt_items_product ON ocr_receipt_items(product_id);
