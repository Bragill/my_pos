const request = require('supertest');
const app = require('./src/server');
const jwt = require('jsonwebtoken');

const JWT_SECRET = "pos_secret_key_2024";

async function test() {
  // Give some time for DB to init (as server.js calls start() which is async)
  await new Promise(resolve => setTimeout(resolve, 1000));

  const token = jwt.sign(
    { id: 'e6375492-0fc9-400c-9144-8e583f64261f', username: 'admin', role: 'admin', permissions: {} },
    JWT_SECRET
  );

  console.log("Testing /api/stores/current...");
  try {
    const res = await request(app)
      .get('/api/stores/current')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', 'store-1');
    
    console.log("Status:", res.status);
    console.log("Body:", JSON.stringify(res.body, null, 2));
  } catch (err) {
    console.error("Test failed:", err);
  }
  process.exit(0);
}

test();
