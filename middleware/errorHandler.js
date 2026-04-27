// backend/middleware/errorHandler.js
// Comprehensive, production-safe error handler.
// Properly handles custom error classes and logs via logger instead of console.

const { errorHandler: appErrorHandler } = require("../utils/errorHandler");

function errorHandler(err, req, res, next) {
  // Use the comprehensive error handler from utils/errorHandler.js
  appErrorHandler(err, req, res, next);
}

module.exports = errorHandler;
