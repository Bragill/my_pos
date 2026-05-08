const Database = require('better-sqlite3');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const dbPath = path.join(__dirname, 'pos_system.db');
const db = new Database(dbPath);

async function runD1Command(sql) {
    try {
        const response = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
            { sql: sql, params: [] },
            {
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data;
    } catch (err) {
        // Suppress "table already exists" or "no such table" during cleanup
        if (err.response?.data?.errors?.[0]?.code === 7500) {
            return { success: true, warning: err.response.data.errors[0].message };
        }
        console.error('D1 API Error:', err.response?.data || err.message);
        return { success: false, errors: [err.message] };
    }
}

async function migrate() {
    console.log('Starting Sequential Force Migration...');
    
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    
    // 1. Cleanup
    console.log('Dropping old tables...');
    for (const t of [...tables].reverse()) {
        await runD1Command(`DROP TABLE IF EXISTS ${t.name}`);
    }

    // 2. Schema
    console.log('Creating new schema...');
    for (const t of tables) {
        const res = await runD1Command(t.sql);
        if (res.success) console.log(`✅ Table created: ${t.name}`);
    }

    // 3. Data
    console.log('Importing data (one by one to avoid FK issues)...');
    await runD1Command('PRAGMA foreign_keys = OFF');

    for (const table of tables) {
        const rows = db.prepare(`SELECT * FROM ${table.name}`).all();
        if (rows.length === 0) continue;

        console.log(`Table ${table.name}: Uploading ${rows.length} rows...`);
        
        for (const row of rows) {
            const columns = Object.keys(row).join(', ');
            const placeholders = Object.keys(row).map(() => '?').join(', ');
            const params = Object.values(row);

            try {
                await axios.post(
                    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
                    { 
                        sql: `INSERT OR IGNORE INTO ${table.name} (${columns}) VALUES (${placeholders})`, 
                        params: params 
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${API_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            } catch (err) {
                console.error(`❌ Failed row in ${table.name}:`, err.message);
            }
        }
        console.log(`✅ ${table.name} finished.`);
    }

    await runD1Command('PRAGMA foreign_keys = ON');
    console.log('Migration Successfully Completed!');
}

migrate().catch(console.error);
