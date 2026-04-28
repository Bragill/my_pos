const errorHandler = (err, req, res, next) => {
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
