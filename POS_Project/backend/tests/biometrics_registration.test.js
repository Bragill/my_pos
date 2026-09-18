const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Set dev secret for test environment
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

// Helper to simulate HTTP requests without opening a network socket
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

describe('BIO-102: WebAuthn Registration Endpoints (TDD)', () => {
  const adminToken = jwt.sign(
    { id: 'test-admin-uuid', username: 'admin', role: 'admin', permissions: { all: true } },
    process.env.JWT_SECRET
  );

  const managerToken = jwt.sign(
    { id: 'test-manager-uuid', username: 'manager_som', role: 'manager', permissions: { pos: true } },
    process.env.JWT_SECRET
  );

  const cashierToken = jwt.sign(
    { id: 'test-cashier-uuid', username: 'cashier_noi', role: 'cashier', permissions: { pos: true } },
    process.env.JWT_SECRET
  );

  before(async () => {
    // Ensure table exists in local test db
    await db.run(`
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
      )
    `);
  });

  test('1. Should return 401 Unauthorized when no token provided', async () => {
    const res = await makeRequest('/api/biometrics/register-options', { method: 'POST' });
    assert.equal(res.status, 401);
    assert.equal(res.data?.success, false);
  });

  test('2. Should return 403 Forbidden when caller is Cashier', async () => {
    const res = await makeRequest('/api/biometrics/register-options', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cashierToken}` }
    });
    assert.equal(res.status, 403);
    assert.match(res.data?.error?.message || res.data?.message || '', /เฉพาะผู้จัดการหรือผู้ดูแลระบบ/);
  });

  test('3. Should return 200 and valid challenge when caller is Admin', async () => {
    const res = await makeRequest('/api/biometrics/register-options', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.ok(res.data?.data?.challenge, 'Must return a challenge');
    assert.equal(typeof res.data?.data?.challenge, 'string');
    assert.ok(res.data?.data?.pubKeyCredParams?.length > 0);
  });

  test('4. Should register credential via POST /api/biometrics/register-verify', async () => {
    const testCredId = 'test_cred_id_' + Date.now();
    const testPubKey = 'test_mock_public_key_spki_base64url';

    const res = await makeRequest('/api/biometrics/register-verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-device-mac': 'MAC: 75:01:C0:D3:60:3D'
      },
      body: {
        credential_id: testCredId,
        public_key: testPubKey,
        algorithm: 'ES256',
        device_name: 'iPad Pro (Front Counter)'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.ok(res.data?.credential?.id);

    // Verify stored in DB
    const row = await db.get('SELECT * FROM user_biometrics WHERE credential_id = ?', [testCredId]);
    assert.ok(row, 'Row must exist in user_biometrics table');
    assert.equal(row.user_id, 'test-admin-uuid');
    assert.equal(row.device_name, 'iPad Pro (Front Counter)');
  });

  test('5. Should list registered credentials via GET /api/biometrics/my-credentials', async () => {
    const res = await makeRequest('/api/biometrics/my-credentials', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.ok(Array.isArray(res.data?.credentials));
    assert.ok(res.data.credentials.length > 0);
  });

  test('6. Should delete credential via DELETE /api/biometrics/credentials/:id', async () => {
    const row = await db.get('SELECT id FROM user_biometrics WHERE user_id = ? LIMIT 1', ['test-admin-uuid']);
    assert.ok(row, 'Need a row to delete');

    const res = await makeRequest(`/api/biometrics/credentials/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);

    const check = await db.get('SELECT * FROM user_biometrics WHERE id = ?', [row.id]);
    assert.ok(!check, 'Row should be deleted from DB');
  });
});
