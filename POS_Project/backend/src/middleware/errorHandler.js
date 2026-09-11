const fs = require('fs');
const path = require('path');

const logFile = typeof __dirname !== 'undefined' ? path.join(__dirname, '../../error.log') : null;

const errorHandler = (err, req, res, next) => {
  const errorLog = `[${new Date().toISOString()}] ${req.method} ${req.url}\nError: ${err.message}\nStack: ${err.stack}\n\n`;
  if (logFile && typeof fs.appendFileSync === 'function') {
    try {
      fs.appendFileSync(logFile, errorLog);
    } catch (_) {}
  }
  
  console.error("API Error:", err);
  if (err.stack) console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'เกิดข้อผิดพลาดภายในระบบ';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { errorHandler, AppError };
