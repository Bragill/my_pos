require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { init: initDb } = require('./database/dbHelper');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});
app.use('/api/', limiter);

async function start() {
  await initDb();

  const authRoutes = require('./routes/auth');
  const productRoutes = require('./routes/products');
  const categoryRoutes = require('./routes/categories');
  const orderRoutes = require('./routes/orders');
  const inventoryRoutes = require('./routes/inventory');
  const customerRoutes = require('./routes/customers');
  const reportRoutes = require('./routes/reports');
  const settingsRoutes = require('./routes/settings');
  const shiftRoutes = require('./routes/shifts');
  const userRoutes = require('./routes/users');
  const debtorRoutes = require('./routes/debtors');
  const storeRoutes = require('./routes/stores');
  const ocrRoutes = require('./modules/ocr/ocrRoutes');

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/sales', require('./routes/sales'));
  app.use('/api/settings', settingsRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/debtors', debtorRoutes);
  app.use('/api/stores', storeRoutes);
  app.use('/api/ocr', ocrRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }) });
  });

  app.use(errorHandler);

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

start().catch(console.error);

module.exports = app;
