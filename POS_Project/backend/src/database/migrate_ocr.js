const { getDb } = require('./connection');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log('Starting OCR migration...');
    const db = await getDb();
    
    const migrationSql = fs.readFileSync(
        path.join(__dirname, 'ocr_migrations.sql'),
        'utf8'
    );

    try {
        db.exec(migrationSql);
        console.log('OCR migration completed successfully.');
    } catch (error) {
        console.error('OCR migration failed:', error);
        process.exit(1);
    }
}

migrate();
