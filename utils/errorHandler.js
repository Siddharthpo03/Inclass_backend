// inclass-backend/utils/errorHandler.js
// Centralized error handling utilities

/**
 * Custom error classes for different error types
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Authentication failed", details = null) {
    super(message, 401, "AUTHENTICATION_ERROR", details);
  }
}

class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions", details = null) {
    super(message, 403, "AUTHORIZATION_ERROR", details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = "Resource", details = null) {
    super(`${resource} not found`, 404, "NOT_FOUND", details);
  }
}

class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, "CONFLICT", details);
  }
}

class DatabaseError extends AppError {
  constructor(message = "Database operation failed", details = null) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}

/**
 * Standard error response format
 */
function formatErrorResponse(error, includeStack = false) {
  const response = {
    success: false,
    error: {
      message: error.message || "An error occurred",
      code: error.code || "INTERNAL_ERROR",
    },
  };

  if (error.details) {
    response.error.details = error.details;
  }

  if (includeStack && process.env.NODE_ENV === "development") {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Express error handling middleware
 */
function errorHandler(err, req, res, next) {
  let error = err;

  // Handle known error types
  if (!(error instanceof AppError)) {
    // Handle PostgreSQL errors
    if (error.code) {
      switch (error.code) {
        case "23505": // Unique violation
          error = new ConflictError("Resource already exists", {
            constraint: error.constraint,
            detail: error.detail,
          });
          break;
        case "23503": // Foreign key violation
          error = new ValidationError("Referenced resource does not exist", {
            constraint: error.constraint,
            detail: error.detail,
          });
          break;
        case "23502": // Not null violation
          error = new ValidationError("Required field is missing", {
            column: error.column,
          });
          break;
        case "42P01": // Undefined table
          error = new DatabaseError("Database table does not exist", {
            table: error.table,
          });
          break;
        case "ECONNREFUSED": // Connection refused
          error = new DatabaseError("Database connection failed");
          break;
        default:
          // Unknown database error
          error = new DatabaseError("Database operation failed", {
            code: error.code,
          });
      }
    } else if (error.name === "ValidationError") {
      // Joi or other validation errors
      error = new ValidationError(error.message, error.details);
    } else if (error.name === "JsonWebTokenError") {
      error = new AuthenticationError("Invalid token");
    } else if (error.name === "TokenExpiredError") {
      error = new AuthenticationError("Token expired");
    } else {
      // Unknown error
      error = new AppError(
        error.message || "Internal server error",
        500,
        "INTERNAL_ERROR",
      );
    }
  }

  // Log error
  const logger = require("./logger");
  const logLevel = error.statusCode >= 500 ? "error" : "warn";
  logger[logLevel]("Error occurred", {
    path: req.path,
    method: req.method,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    details: error.details,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });

  // Send error response
  res.status(error.statusCode || 500).json(formatErrorResponse(error));
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation helper
 */
function validateRequired(fields, data) {
  const missing = [];
  for (const field of fields) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ""
    ) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(", ")}`,
      {
        missingFields: missing,
      },
    );
  }
}

/**
 * Validate email format
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError("Invalid email format");
  }
}

/**
 * Validate role
 */
function validateRole(role) {
  const validRoles = ["admin", "faculty", "student"];
  if (!validRoles.includes(role)) {
    throw new ValidationError(
      `Invalid role. Must be one of: ${validRoles.join(", ")}`,
    );
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  formatErrorResponse,
  errorHandler,
  asyncHandler,
  validateRequired,
  validateEmail,
  validateRole,
};
