const db = require('./dbHelper');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log('Starting OCR migration on Cloudflare D1...');
    
    const migrationSql = fs.readFileSync(
        path.join(__dirname, 'ocr_migrations.sql'),
        'utf8'
    );

    try {
        await db.run(migrationSql);
        console.log('OCR migration completed successfully on D1.');
    } catch (error) {
        console.error('OCR migration failed:', error);
        process.exit(1);
    }
}

migrate();
