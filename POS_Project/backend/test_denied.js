const app = require('./src/server');
const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = "pos_secret_key_2024";

async function test() {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    console.log(`Test server listening on port ${port}`);

    // manager id: 112a5c70-8033-44d4-ac19-92ca25c14025
    const token = jwt.sign(
      { id: '112a5c70-8033-44d4-ac19-92ca25c14025', username: 'manager', role: 'manager', permissions: {} },
      JWT_SECRET
    );

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/stores/current`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-store-id': 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'
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
