// inclass-backend/middleware/auth.js

const jwt = require("jsonwebtoken");
require("dotenv").config();
const logger = require("../utils/logger");

// The middleware function that checks for a token and validates roles
function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "Missing token" });

    // Format: "Bearer <TOKEN>"
    const token = header.split(" ")[1];

    try {
      // JWT_SECRET is loaded from the .env file
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach decoded user payload to request
      req.user = decoded;

      // Check if role exists in token
      if (!decoded.role) {
        logger.error("Token missing role field", {
          userId: decoded.id,
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          message: "Token is missing role information. Please login again.",
          code: "MISSING_ROLE",
        });
      }

      // Role-based access control
      if (requiredRoles.length && !requiredRoles.includes(decoded.role)) {
        logger.warn("Role check failed", {
          requiredRoles,
          userRole: decoded.role,
          userId: decoded.id,
          path: req.path,
          method: req.method,
        });
        return res.status(403).json({
          message: "Forbidden: Insufficient role permissions.",
          required: requiredRoles,
          provided: decoded.role || "none",
          hint: "Please ensure you are logged in with the correct account type.",
        });
      }

      // Log successful auth for debugging
      if (requiredRoles.length > 0) {
        logger.debug("Role check passed", {
          requiredRoles,
          userRole: decoded.role,
          userId: decoded.id,
          path: req.path,
        });
      }

      next();
    } catch (err) {
      // Provide more specific error messages
      let errorMessage = "Invalid or expired token.";
      if (err.name === "TokenExpiredError") {
        errorMessage = "Token expired. Please login again.";
        logger.debug("Token expired", { expiredAt: err.expiredAt });
      } else if (err.name === "JsonWebTokenError") {
        errorMessage = "Invalid token format.";
        logger.debug("Invalid token format: " + err.message);
      } else {
        logger.debug("Token verification error: " + err.message);
      }
      res.status(401).json({ message: errorMessage });
    }
  };
}

module.exports = auth;
