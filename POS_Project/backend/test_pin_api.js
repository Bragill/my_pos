const app = require('./src/server');
const http = require('http');

async function test() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    console.log(`Test server listening on port ${port}`);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: "0000" })
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
