require('dotenv').config();
const app = require('./app');
const { init: initDb } = require('./database/dbHelper');

const PORT = process.env.PORT || 3000;

async function start() {
  await initDb();

  require("./jobs/expiryCheckJob").start();

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  app.listen(PORT, () => {
    console.log('==========================================');
    console.log(`[v1.1.8] POS Backend running on http://localhost:${PORT}`);
    console.log('==========================================');
  });
}

if (require.main === module) {
  start().catch(console.error);
}

module.exports = { app, start };
