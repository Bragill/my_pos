const app = require('./src/server');
const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = "pos_secret_key_2024";

async function test() {
  // Give time for server.js to call start()
  await new Promise(resolve => setTimeout(resolve, 2000));

  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    console.log(`Test server listening on port ${port}`);

    const token = jwt.sign(
      { id: 'e6375492-0fc9-400c-9144-8e583f64261f', username: 'admin', role: 'admin', permissions: {} },
      JWT_SECRET
    );

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/stores/current`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-store-id': 'store-1'
        }
      });
      console.log("Status:", res.status);
      const body = await res.json();
      console.log("Body:", JSON.stringify(body, null, 2));
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

test();
