const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const db = require('../database/dbHelper');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('กรุณาเข้าสู่ระบบ', 401));
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pos_secret_key_dev_only');
    req.user = decoded;

    // Multi-store: Extract store_id from header
    let storeId = req.headers['x-store-id'];
    
    // Ensure storeId is a string (could be an array if header sent multiple times)
    if (Array.isArray(storeId)) {
      storeId = storeId[0];
    }
    
    // If storeId is missing, try to get the first assigned store
    if (!storeId || storeId === 'null' || storeId === 'undefined') {
      const firstStore = await db.get("SELECT store_id FROM user_stores WHERE user_id = ? AND is_active = 1 LIMIT 1", [req.user.id]);
      storeId = firstStore?.store_id;
    }

    if (storeId) {
      // Validate access if not admin
      if (req.user.role !== 'admin') {
        const hasAccess = await db.get("SELECT 1 FROM user_stores WHERE user_id = ? AND store_id = ? AND is_active = 1", [req.user.id, storeId]);
        if (!hasAccess) {
          console.warn(`Access denied for user ${req.user.username} to store ${storeId}`);
          return next(new AppError('คุณไม่มีสิทธิ์เข้าถึงสาขานี้', 403));
        }
      }
      req.store_id = storeId;
    }

    next();
  } catch (err) {
    console.error('Auth Error:', err.message);
    return next(new AppError('Token ไม่ถูกต้องหรือหมดอายุ', 401));
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 403));
    }
    next();
  };
};

module.exports = { authenticate, authorize };
