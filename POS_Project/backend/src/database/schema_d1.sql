-- Cloudflare D1 (SQLite) Schema for POS System

-- 1. roles
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 2. users
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    pin_code TEXT,
    full_name TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES roles(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 3. categories
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    store_id TEXT REFERENCES stores(id),
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, -- Boolean
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 4. products
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_id TEXT REFERENCES categories(id),
    store_id TEXT REFERENCES stores(id),
    cost_price REAL NOT NULL DEFAULT 0,
    pending_cost_price REAL,
    selling_price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1, -- Boolean
    is_featured INTEGER DEFAULT 0, -- Boolean
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 5. inventory
CREATE TABLE inventory (
    product_id TEXT PRIMARY KEY REFERENCES products(id),
    store_id TEXT REFERENCES stores(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 6. stock_transactions
CREATE TABLE stock_transactions (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    store_id TEXT REFERENCES stores(id),
    type TEXT NOT NULL CHECK (type IN ('receive', 'issue', 'adjust', 'sale', 'return')),
    quantity INTEGER NOT NULL,
    remark TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 7. customers
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    member_code TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    store_id TEXT REFERENCES stores(id),
    points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 8. orders
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id),
    customer_id TEXT REFERENCES customers(id),
    store_id TEXT REFERENCES stores(id),
    sub_total REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT CHECK (payment_method IN ('cash', 'credit_card', 'qr_promptpay', 'transfer', 'outstanding')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'voided', 'parked', 'refunded', 'รอชำระพร้อมเพย์')),
    is_synced INTEGER DEFAULT 0,
    tax_invoice_no TEXT,
    remark TEXT,
    debtor_id TEXT,
    debtor_name TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 9. order_items
CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    store_id TEXT REFERENCES stores(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0,
    total_price REAL NOT NULL
);

-- 10. payments
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES stores(id),
    payment_type TEXT NOT NULL,
    amount REAL NOT NULL,
    reference_no TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 11. shifts
CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    store_id TEXT REFERENCES stores(id),
    opening_amount REAL DEFAULT 0,
    closing_amount REAL,
    expected_amount REAL,
    difference REAL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
-- 12. sales_transaction_logs
CREATE TABLE sales_transaction_logs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    action_type TEXT NOT NULL, -- 'edit', 'void'
    original_value TEXT, -- JSON string
    updated_value TEXT, -- JSON string
    reason TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

CREATE INDEX idx_sales_logs_order ON sales_transaction_logs(order_id);
CREATE INDEX idx_sales_logs_user ON sales_transaction_logs(user_id);

-- 12. stores (formerly store_settings)
CREATE TABLE stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    tax_id TEXT,
    vat_rate REAL DEFAULT 7.00,
    receipt_header TEXT,
    receipt_footer TEXT,
    logo_url TEXT,
    promptpay_number TEXT,
    promptpay_name TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 13. debtors
CREATE TABLE debtors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    note TEXT,
    store_id TEXT REFERENCES stores(id),
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 14. user_stores
CREATE TABLE user_stores (
    user_id TEXT NOT NULL REFERENCES users(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    PRIMARY KEY (user_id, store_id)
);

-- 15. ocr_receipts
CREATE TABLE ocr_receipts (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id),
    user_id TEXT REFERENCES users(id),
    image_url TEXT,
    raw_text TEXT,
    total_amount REAL,
    status TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+7 hours'))
);

-- 16. ocr_receipt_items
CREATE TABLE ocr_receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT REFERENCES ocr_receipts(id),
    product_id TEXT REFERENCES products(id),
    item_name TEXT,
    quantity INTEGER,
    unit_price REAL,
    total_price REAL
);

-- 17. user_biometrics
CREATE TABLE user_biometrics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mac_address TEXT,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    algorithm TEXT DEFAULT 'ES256',
    counter INTEGER DEFAULT 0,
    device_name TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    last_used_at DATETIME
);

CREATE INDEX idx_user_biometrics_user ON user_biometrics(user_id);
CREATE INDEX idx_user_biometrics_cred ON user_biometrics(credential_id);
CREATE INDEX idx_user_biometrics_mac ON user_biometrics(mac_address);


