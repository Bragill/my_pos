const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'pos_system.db');
const outputPath = path.join(__dirname, 'local_data_dump.sql');

if (!fs.existsSync(dbPath)) {
    console.error('Local database not found at:', dbPath);
    process.exit(1);
}

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);

let sqlOutput = '-- POS Data Migration Dump\n';
sqlOutput += 'PRAGMA foreign_keys = OFF;\n\n';

// Order matters for foreign keys if we didn't disable them, but we did.
// Still keeping a logical order for readability.
const priorityOrder = [
    'roles', 'stores', 'store_settings', 'categories', 'users', 
    'customers', 'debtors', 'products', 'inventory', 'orders', 
    'order_items', 'payments', 'shifts', 'stock_transactions',
    'user_stores', 'ocr_receipts', 'ocr_receipt_items'
];
const sortedTables = [...priorityOrder.filter(t => tables.includes(t)), ...tables.filter(t => !priorityOrder.includes(t))];

for (const table of sortedTables) {
    console.log(`Exporting table: ${table}...`);
    let rows = db.prepare(`SELECT * FROM ${table}`).all();
    
    if (rows.length === 0) continue;

    // Mapping for renamed tables
    const targetTable = table === 'store_settings' ? 'stores' : table;

    // Map column names if necessary
    if (table === 'store_settings') {
        rows = rows.map(row => {
            const newRow = { ...row };
            if (newRow.hasOwnProperty('store_name')) {
                newRow.name = newRow.store_name;
                delete newRow.store_name;
            }
            return newRow;
        });
    }

    sqlOutput += `-- Data for ${table} -> ${targetTable}\n`;
    sqlOutput += `INSERT OR IGNORE INTO ${targetTable} (${Object.keys(rows[0]).join(', ')}) VALUES\n`;
    
    const values = rows.map(row => {
        const rowValues = Object.values(row).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
        });
        return `(${rowValues.join(', ')})`;
    });

    sqlOutput += values.join(',\n') + ';\n\n';
}

sqlOutput += 'PRAGMA foreign_keys = ON;';

fs.writeFileSync(outputPath, sqlOutput);
console.log(`Success! Data exported to: ${outputPath}`);
console.log('Now run the wrangler command to upload this data.');
