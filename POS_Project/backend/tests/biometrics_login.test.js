const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'pos_secret_key_test';

// In-memory SQLite simulating Cloudflare D1 for fast local unit testing
const Database = require('better-sqlite3');
const memDb = new Database(':memory:');

globalThis.__D1_DB__ = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async all() {
            try {
              const stmt = memDb.prepare(sql);
              const results = stmt.all(...params);
              return { results };
            } catch (e) {
              return { results: [] };
            }
          },
          async run() {
            try {
              const stmt = memDb.prepare(sql);
              const info = stmt.run(...params);
              return {
                results: [],
                meta: { changes: info.changes, last_row_id: info.lastInsertRowid }
              };
            } catch (e) {
              return { results: [], meta: { changes: 0 } };
            }
          }
        };
      }
    };
  }
};

const app = require('../src/app');
const db = require('../src/database/dbHelper');

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}${path}`;
      const headers = options.headers || {};
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          server.close(() => resolve({ status: res.status, data: json }));
        })
        .catch((err) => {
          server.close(() => reject(err));
        });
    });
  });
}

describe('BIO-103: Two-Factor Biometric Login Endpoints (TDD)', () => {
  const testMac = 'MAC: 75:01:C0:D3:60:3D';
  const testCredId = 'cred_test_biometric_12345';
  const testAdminId = 'usr_admin_001';
  let pinHash;

  before(async () => {
    pinHash = await bcrypt.hash('123456', 10);
    const passHash = await bcrypt.hash('admin123', 10);

    // Setup required mock tables
    memDb.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        permissions TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        pin_code TEXT,
        full_name TEXT NOT NULL,
        role_id TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS user_stores (
        user_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        PRIMARY KEY (user_id, store_id)
      );

      CREATE TABLE IF NOT EXISTS device_security (
        id TEXT PRIMARY KEY,
        mac_address TEXT NOT NULL UNIQUE,
        ip_address TEXT,
        location TEXT,
        user_agent TEXT,
        device_name TEXT,
        last_user_name TEXT,
        failed_attempts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'NORMAL',
        lock_until TEXT,
        locked_reason TEXT,
        is_bot INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      );

      CREATE TABLE IF NOT EXISTS user_biometrics (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        mac_address TEXT,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        algorithm TEXT DEFAULT 'ES256',
        counter INTEGER DEFAULT 0,
        device_name TEXT,
        created_at TEXT DEFAULT (datetime('now', '+7 hours')),
        last_used_at TEXT
      );
    `);

    // Seed test data
    memDb.exec(`
      INSERT OR REPLACE INTO roles (id, name, permissions) VALUES ('role_admin', 'admin', '{"all":true}');
      INSERT OR REPLACE INTO stores (id, name, is_active) VALUES ('store_01', 'Main Branch', 1);
      INSERT OR REPLACE INTO users (id, username, password_hash, pin_code, full_name, role_id, status)
      VALUES ('${testAdminId}', 'admin', '${passHash}', '${pinHash}', 'Store Admin', 'role_admin', 'active');
      INSERT OR REPLACE INTO user_stores (user_id, store_id, is_active) VALUES ('${testAdminId}', 'store_01', 1);
      INSERT OR REPLACE INTO user_biometrics (id, user_id, mac_address, credential_id, public_key, algorithm, device_name)
      VALUES ('bio_01', '${testAdminId}', '${testMac}', '${testCredId}', 'mock_pub_key', 'ES256', 'iPad Pro Counter');
      INSERT OR REPLACE INTO device_security (id, mac_address, failed_attempts, status)
      VALUES ('dev_01', '${testMac}', 0, 'NORMAL');
    `);
  });

  test('1. Should return challenge & allowCredentials from POST /login-options', async () => {
    const res = await makeRequest('/api/biometrics/login-options', {
      method: 'POST',
      headers: { 'x-device-mac': testMac }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.ok(res.data?.data?.challenge, 'Must return challenge');
    assert.ok(Array.isArray(res.data?.data?.allowCredentials));
    assert.equal(res.data.data.allowCredentials.length, 1);
    assert.equal(res.data.data.allowCredentials[0].id, testCredId);
  });

  test('2. Should reject login-options with 403 when device is BLACKLISTED', async () => {
    await db.run("UPDATE device_security SET status = 'BLACKLISTED' WHERE mac_address = ?", [testMac]);

    const res = await makeRequest('/api/biometrics/login-options', {
      method: 'POST',
      headers: { 'x-device-mac': testMac }
    });

    assert.equal(res.status, 403);
    assert.match(res.data?.message || res.data?.error?.message || '', /Blacklisted/i);

    // Restore device to NORMAL
    await db.run("UPDATE device_security SET status = 'NORMAL' WHERE mac_address = ?", [testMac]);
  });

  test('3. Should reject login-options with 429 when device is LOCKED_TEMP', async () => {
    const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await db.run("UPDATE device_security SET status = 'LOCKED_TEMP', lock_until = ? WHERE mac_address = ?", [lockUntil, testMac]);

    const res = await makeRequest('/api/biometrics/login-options', {
      method: 'POST',
      headers: { 'x-device-mac': testMac }
    });

    assert.equal(res.status, 429);
    assert.equal(res.data?.status || res.data?.error?.status, 'LOCKED_TEMP');
    assert.ok((res.data?.remaining_seconds || res.data?.error?.remaining_seconds) > 0);

    // Restore device to NORMAL
    await db.run("UPDATE device_security SET status = 'NORMAL', lock_until = NULL WHERE mac_address = ?", [testMac]);
  });

  test('4. Should reject login-verify with 401 on incorrect Quick PIN and increment failed attempts', async () => {
    const res = await makeRequest('/api/biometrics/login-verify', {
      method: 'POST',
      headers: { 'x-device-mac': testMac },
      body: {
        credential_id: testCredId,
        quick_pin: '999999' // Wrong PIN
      }
    });

    assert.equal(res.status, 401);
    assert.match(res.data?.error?.message || res.data?.message || '', /ไม่ถูกต้อง/);

    const dev = await db.get('SELECT failed_attempts FROM device_security WHERE mac_address = ?', [testMac]);
    assert.equal(dev.failed_attempts, 1);
  });

  test('5. Should lock device with 429 when 5 failed Quick PIN attempts reached', async () => {
    await db.run("UPDATE device_security SET failed_attempts = 4 WHERE mac_address = ?", [testMac]);

    const res = await makeRequest('/api/biometrics/login-verify', {
      method: 'POST',
      headers: { 'x-device-mac': testMac },
      body: {
        credential_id: testCredId,
        quick_pin: '999999' // 5th failure
      }
    });

    assert.equal(res.status, 429);
    assert.equal(res.data?.status || res.data?.error?.status, 'LOCKED_TEMP');

    // Restore device
    await db.run("UPDATE device_security SET status = 'NORMAL', failed_attempts = 0, lock_until = NULL WHERE mac_address = ?", [testMac]);
  });

  test('6. Should successfully log in and return JWT + Stores on valid credential and correct Quick PIN', async () => {
    const res = await makeRequest('/api/biometrics/login-verify', {
      method: 'POST',
      headers: { 'x-device-mac': testMac },
      body: {
        credential_id: testCredId,
        quick_pin: '123456' // Correct PIN
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.ok(res.data?.data?.token, 'Must return JWT token');
    assert.equal(res.data?.data?.user?.username, 'admin');
    assert.equal(res.data?.data?.user?.role, 'admin');
    assert.ok(Array.isArray(res.data?.data?.stores));
    assert.equal(res.data.data.stores.length, 1);

    // Verify failed_attempts reset to 0
    const dev = await db.get('SELECT failed_attempts FROM device_security WHERE mac_address = ?', [testMac]);
    assert.equal(dev.failed_attempts, 0);

    // Verify user_biometrics last_used_at updated
    const bio = await db.get('SELECT last_used_at FROM user_biometrics WHERE credential_id = ?', [testCredId]);
    assert.ok(bio.last_used_at);
  });
});
