// inclass-backend/utils/logger.js
// Winston logger configured for JSON structured logging.

const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({ fillExcept: ["timestamp", "level", "message"] }),
    format.json()
  ),
  transports: [
    new transports.Console(),
  ],
});

module.exports = logger;

