// inclass-backend/server.js
// Production/server entry point: creates HTTP server, attaches Socket.io,
// and starts listening on the configured port.

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const http = require("http");
const app = require("./app");
const socketInit = require("./socket");
const logger = require("./utils/logger");

// Optional Sentry integration for production monitoring (only when SENTRY_DSN is set)
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate:
      typeof process.env.SENTRY_TRACES_SAMPLE_RATE !== "undefined"
        ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE, 10)
        : 0.1,
    integrations: [Sentry.expressIntegration()],
  });
  logger.info("Sentry initialized for backend monitoring");
}

const PORT = process.env.PORT || 4000;

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io with the HTTP server, reusing CORS origins from app
const allowedOrigins = (app.locals && app.locals.allowedOrigins) || [
  "https://inclass.siddharthp.com",
  "http://localhost:5173",
];

const io = socketInit.init(server, {
  origin: allowedOrigins,
});

// Make io available to routes if needed
app.set("io", io);

// Attach server error handler
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error("Port already in use", {
      port: PORT,
      hint: "Use npx kill-port <port> then rerun server",
    });
    if (Sentry) {
      Sentry.captureException(err);
    }
    process.exit(1);
  }
  if (Sentry) {
    Sentry.captureException(err);
  }
  throw err;
});

// Start HTTP listener
server.listen(PORT, () => {
  logger.info("HTTP server listening", { port: PORT });
  logger.info("Socket.io initialized and ready for connections");

  // P3 DB-004: Schedule duplicate attendance detection daily at 2 AM
  // TEMPORARILY DISABLED during quota limit recovery - can be re-enabled after Azure quota reset
  // const { startDuplicateDetectionSchedule } = require("./jobs/duplicateDetection");
  // startDuplicateDetectionSchedule();
});

// Clean shutdown on Ctrl+C so the port is released immediately
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down server...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
});

module.exports = server;
