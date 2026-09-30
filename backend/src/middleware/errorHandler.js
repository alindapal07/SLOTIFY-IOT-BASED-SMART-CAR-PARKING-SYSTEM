/**
 * Centralized Error Handling Middleware
 * Provides consistent HTTP status codes, structured error messages,
 * and shields stack traces in production environments while maintaining
 * 100% backward compatibility with existing frontend error handling.
 */
const config = require('../config/environment');

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || 'Internal Server Error';
  let errorType = err.name || 'ServerError';

  // Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = `Resource not found with id of ${err.value}`;
    errorType = 'INVALID_RESOURCE_ID';
  }

  // Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Value must be unique.`;
    errorType = 'DUPLICATE_KEY_ERROR';
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
    errorType = 'VALIDATION_ERROR';
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token. Authorization denied.';
    errorType = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired. Please refresh your session.';
    errorType = 'TOKEN_EXPIRED';
  }

  // Safe logging — avoids logging request bodies that might have passwords
  console.error(`[ERROR] ${req.method} ${req.originalUrl} - ${statusCode} - ${message}`);

  res.status(statusCode).json({
    success: false,
    message,
    error: errorType,
    ...(config.isProduction ? {} : { stack: err.stack })
  });
};

module.exports = errorHandler;
