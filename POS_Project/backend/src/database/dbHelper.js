const axios = require('axios');
const http = require('http');
const https = require('https');

const D1_MAX_CONCURRENT = parseInt(process.env.D1_MAX_CONCURRENT || '6', 10);
const D1_TIMEOUT_MS = parseInt(process.env.D1_TIMEOUT_MS || '8000', 10);
const D1_QUEUE_TIMEOUT_MS = parseInt(process.env.D1_QUEUE_TIMEOUT_MS || '5000', 10);

const d1HttpsAgent = new https.Agent({ keepAlive: true, maxSockets: D1_MAX_CONCURRENT, maxFreeSockets: D1_MAX_CONCURRENT });
const d1HttpAgent = new http.Agent({ keepAlive: true, maxSockets: D1_MAX_CONCURRENT });

let active = 0;
const waiters = [];

let workerBindings = null;

function setWorkerBindings(env) {
  workerBindings = env;
  if (env?.DB) {
    globalThis.__D1_DB__ = env.DB;
  }
}

function getWorkerBindings() {
  return workerBindings;
}

function acquire() {
  if (active < D1_MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(entry);
      if (idx !== -1) waiters.splice(idx, 1);
      reject(new Error(`D1 queue timeout after ${D1_QUEUE_TIMEOUT_MS}ms (active=${active}, waiting=${waiters.length})`));
    }, D1_QUEUE_TIMEOUT_MS);
    const entry = { resolve: () => { clearTimeout(timer); active++; resolve(); } };
    waiters.push(entry);
  });
}

function release() {
  active--;
  const next = waiters.shift();
  if (next) next.resolve();
}

async function queryD1(sql, params = [], retryCount = 0) {
  // 1. Edge Mode: If running on Cloudflare Workers with native D1 binding
  const nativeDb = workerBindings?.DB || (typeof globalThis !== 'undefined' && globalThis.__D1_DB__);
  if (nativeDb) {
    try {
      const stmt = nativeDb.prepare(sql).bind(...params);
      const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sql);
      if (isSelect) {
        const res = await stmt.all();
        return {
          results: res.results || []
        };
      } else {
        const res = await stmt.run();
        return {
          results: [],
          meta: {
            changes: res.meta?.changes || 0,
            last_row_id: res.meta?.last_row_id || null
          }
        };
      }
    } catch (err) {
      console.error(`[D1 Native Error] ${err.message}: ${sql.substring(0, 80)}`);
      throw err;
    }
  }

  // 2. Node.js Mode: Fall back to Cloudflare D1 HTTP REST API for local dev
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
  const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

  const MAX_RETRIES = 3;
  const startTime = Date.now();

  await acquire();
  try {
    const response = await axios.post(
      D1_API_URL,
      {
        sql: sql,
        params: params,
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: D1_TIMEOUT_MS,
        httpsAgent: d1HttpsAgent,
        httpAgent: d1HttpAgent,
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors[0]?.message || 'D1 API Error');
    }

    const result = response.data.result;
    if (Array.isArray(result)) {
      return result[0];
    }
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    
    // Handle Rate Limiting (429)
    if (err.response?.status === 429 && retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.warn(`[D1] Rate limited (429), retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
      await new Promise(r => setTimeout(r, delay));
      return queryD1(sql, params, retryCount + 1);
    }

    let errorMessage = err.message;
    if (err.response && err.response.data && err.response.data.errors) {
      errorMessage = `D1 Error: ${err.response.data.errors[0].message}`;
    }
    
    console.error(`[D1 Error] ${duration}ms: ${errorMessage}`);
    throw new Error(errorMessage);
  } finally {
    release();
  }
}

async function init() {
  if (workerBindings?.DB) {
    console.log('Connected to Cloudflare D1 via native Worker binding');
  } else {
    console.log('Connected to Cloudflare D1 via HTTP REST API');
  }
}

async function get(sql, params = []) {
  const result = await queryD1(sql, params);
  return result?.results?.[0] || null;
}

async function all(sql, params = []) {
  const result = await queryD1(sql, params);
  return result?.results || [];
}

async function run(sql, params = []) {
  const result = await queryD1(sql, params);
  return {
    changes: result?.meta?.changes || 0,
    lastInsertRowid: result?.meta?.last_row_id || null
  };
}

function getNativeDb() {
  return workerBindings?.DB || (typeof globalThis !== 'undefined' && globalThis.__D1_DB__) || null;
}

/**
 * Execute multiple write statements.
 * - Native D1 binding: single atomic DB.batch() call.
 * - REST mode: sequential execution (each statement is individually atomic).
 */
async function batch(statements = []) {
  const nativeDb = getNativeDb();
  if (nativeDb && typeof nativeDb.batch === 'function') {
    const prepared = statements.map((s) => nativeDb.prepare(s.sql).bind(...(s.params || [])));
    return await nativeDb.batch(prepared);
  }
  const results = [];
  for (const s of statements) {
    results.push(await module.exports.run(s.sql, s.params || []));
  }
  return results;
}

/**
 * Strict-ish transaction for order creation + stock deduction.
 *
 * work(tx) receives tx = { run(sql, params, undo) } and must perform ALL
 * database writes through tx.run. Reads may use get()/all() directly.
 *
 * - Native D1 binding: statements are collected and executed in ONE atomic
 *   DB.batch(). If work() throws before completion, nothing is executed.
 * - REST mode (Cloudflare D1 HTTP API is stateless, no multi-statement
 *   transactions): statements execute immediately in order; each tx.run may
 *   carry an `undo` ({ sql, params }) which is executed in reverse order if
 *   work() throws (best-effort compensation), then the error is rethrown.
 */
async function runTransaction(work) {
  const nativeDb = getNativeDb();
  if (nativeDb && typeof nativeDb.batch === 'function') {
    const collected = [];
    const tx = {
      run: async (sql, params = []) => {
        collected.push({ sql, params });
        return { changes: 0, lastInsertRowid: null };
      },
    };
    const result = await work(tx);
    const prepared = collected.map((s) => nativeDb.prepare(s.sql).bind(...(s.params || [])));
    await nativeDb.batch(prepared);
    return result;
  }

  const undos = [];
  const tx = {
    run: async (sql, params = [], undo = null) => {
      const res = await module.exports.run(sql, params);
      if (undo) undos.push(undo);
      return res;
    },
  };
  try {
    return await work(tx);
  } catch (err) {
    for (let i = undos.length - 1; i >= 0; i--) {
      try {
        await module.exports.run(undos[i].sql, undos[i].params || []);
      } catch (undoErr) {
        console.error(`[tx rollback] compensation failed: ${undoErr.message}`);
      }
    }
    throw err;
  }
}

module.exports = { init, get, all, run, batch, runTransaction, setWorkerBindings, getWorkerBindings };
