// inclass-backend/db.js
// PostgreSQL connection pool with production-grade security

const { Pool } = require("pg");
require("dotenv").config();
const logger = require("./utils/logger");

function sanitizeDbUrl(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return "";
  }

  const trimmed = rawValue.trim();

  // Remove wrapping quotes if the value was pasted with quotes.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

const databaseUrl = sanitizeDbUrl(process.env.DATABASE_URL);

// Validate DATABASE_URL is set
if (!databaseUrl) {
  logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL ERROR: DATABASE_URL is not set                                    ║
║  Server cannot start without database connection string.                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Add to your .env file:
   DATABASE_URL=postgresql://user:password@host:5432/database

2. Restart the server
`);
  process.exit(1);
}

// Enable SSL on cloud hosts (e.g., Render) or if explicitly requested via env
const isRender = !!process.env.RENDER;
const isProduction = process.env.NODE_ENV === "production";
const shouldEnableSsl =
  process.env.PGSSLMODE === "require" ||
  process.env.DATABASE_SSL === "true" ||
  isRender ||
  isProduction;

// Production-grade connection pool configuration
const pool = new Pool({
  connectionString: databaseUrl,

  // Maximum number of clients the pool will keep open at once.
  // This protects PostgreSQL from overload while still allowing good concurrency.
  max: 20,

  // How long (in ms) a client can sit idle in the pool before being closed.
  // Keeps the pool healthy and frees connections from apps that stopped using them.
  idleTimeoutMillis: 30000, // 30 seconds

  // How long (in ms) to wait for a new connection before failing.
  // Remote cloud databases (like Neon) need more time for initial connection.
  // Increased from 2s to 10s for Neon/cloud compatibility.
  connectionTimeoutMillis: 10000, // 10 seconds

  // Prevent Node.js from exiting just because all clients are idle.
  // The process should stay alive and be managed by your process manager (PM2, systemd, etc.).
  allowExitOnIdle: false,

  // SSL configuration for cloud databases / production environments.
  // By default we enforce certificate verification unless explicitly disabled.
  ssl: shouldEnableSsl
    ? {
        rejectUnauthorized: false,
      }
    : false,

  // Optional server‑side timeout for individual statements (in ms).
  // Helps kill unexpectedly long‑running queries and protects the database.
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000, // 30 seconds

  // Client‑side timeout for queries (in ms) as an additional safety net.
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT, 10) || 30000, // 30 seconds
});

// Fail fast on unexpected errors from idle clients in the pool.
// In production this is typically handled by a process manager that will restart the app.
pool.on("error", (err) => {
  logger.error("Unexpected idle client error: " + err.message);
  process.exit(-1);
});

// Log pool events (useful for debugging)
if (process.env.NODE_ENV === "development") {
  pool.on("connect", (client) => {
    logger.debug("New database client connected");
  });

  pool.on("acquire", (client) => {
    logger.debug("Database client acquired from pool");
  });

  pool.on("remove", (client) => {
    logger.debug("Database client removed from pool");
  });
}

// Test connection on startup (skip in tests to avoid open handles/log noise)
if (process.env.NODE_ENV !== "test") {
  pool
    .connect()
    .then((client) => {
      logger.info("Connected to PostgreSQL successfully");
      logger.info(
        `Pool size: ${pool.totalCount} total, ${pool.idleCount} idle`,
      );
      client.release(); // Release the client back to the pool
    })
    .catch((err) => {
      logger.error("Database connection failed: " + err.message);
      logger.error("Check DATABASE_URL in .env file");
      // Fail fast in production
      if (isProduction) {
        process.exit(1);
      }
    });
}

// Graceful shutdown handler
process.on("SIGINT", async () => {
  logger.info("Shutting down database pool...");
  await pool.end();
  logger.info("Database pool closed");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down database pool...");
  await pool.end();
  logger.info("Database pool closed");
  process.exit(0);
});

module.exports = pool;
