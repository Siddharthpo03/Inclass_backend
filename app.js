// inclass-backend/app.js
// Express application setup (no HTTP listen here).

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./db");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

// --- SEC-004: Critical Security Validation ---
// Validate biometric encryption key before server starts
if (!process.env.BIOMETRIC_ENCRYPTION_KEY) {
  logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: BIOMETRIC_ENCRYPTION_KEY is not set                ║
║  Server cannot start. Biometric data encryption requires a secure key.      ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Generate a secure 64-character hex key (32 bytes for AES-256):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

2. Add to your .env file:
   BIOMETRIC_ENCRYPTION_KEY=<generated-key>

3. Restart the server

SECURITY NOTE: Never commit the encryption key to version control.
Store it securely in production (e.g., environment variables, secrets manager).
`);
  process.exit(1);
}

// Validate key length (minimum 32 bytes = 64 hex characters for AES-256)
if (process.env.BIOMETRIC_ENCRYPTION_KEY.length < 32) {
  logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: BIOMETRIC_ENCRYPTION_KEY is too short             ║
║  Minimum length required: 32 characters (64 hex chars for AES-256)         ║
║  Current length: ${process.env.BIOMETRIC_ENCRYPTION_KEY.length} characters                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Generate a secure 64-character hex key:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

2. Update BIOMETRIC_ENCRYPTION_KEY in your .env file

3. Restart the server
`);
  process.exit(1);
}

// --- SEC-005: Critical JWT Secret Validation ---
// Validate JWT secret before server starts
if (!process.env.JWT_SECRET) {
  logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: JWT_SECRET is not set                             ║
║  Server cannot start. JWT authentication requires a secure secret.         ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Generate a secure JWT secret (minimum 32 characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

2. Add to your .env file:
   JWT_SECRET=<generated-secret>

3. Restart the server

SECURITY NOTE: Never commit the JWT secret to version control.
Store it securely in production (e.g., environment variables, secrets manager).
`);
  process.exit(1);
}

// Validate JWT secret strength (minimum 32 characters for security)
const MIN_JWT_SECRET_LENGTH = 32;
if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: JWT_SECRET is too weak                             ║
║  Minimum length required: ${MIN_JWT_SECRET_LENGTH} characters for security        ║
║  Current length: ${process.env.JWT_SECRET.length} characters                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Generate a secure JWT secret (minimum ${MIN_JWT_SECRET_LENGTH} characters):
   node -e "console.log(require('crypto').randomBytes(${MIN_JWT_SECRET_LENGTH}).toString('hex'))"

2. Update JWT_SECRET in your .env file

3. Restart the server

SECURITY NOTE: Weak JWT secrets are vulnerable to brute-force attacks.
Use a strong, randomly generated secret of at least ${MIN_JWT_SECRET_LENGTH} characters.
`);
  process.exit(1);
}

const app = express();

// --- Security headers (Helmet) - apply early ---
const isProduction = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        connectSrc: ["'self'"],
        scriptSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
      reportOnly: false,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    xFrameOptions: { action: "deny" },
    xContentTypeOptions: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hidePoweredBy: true,
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  }),
);

// --- SEC-003: Strict CORS Configuration ---
// Production-grade CORS: Only allow specific origins based on environment
// Treat NODE_ENV=test the same as development so tests don't require FRONTEND_URL.
const isDevelopment =
  process.env.NODE_ENV === "development" ||
  process.env.NODE_ENV === "test" ||
  !process.env.NODE_ENV;

// Define allowed origins based on environment
let allowedOrigins = [];

if (isDevelopment) {
  // Development: Only allow specific localhost ports
  allowedOrigins = [
    "http://localhost:5173", // Vite default port
    "http://localhost:3000", // React default port
  ];
  logger.info(
    "CORS: Development mode - Allowing: " + allowedOrigins.join(", "),
  );
} else {
  // Production: Only allow FRONTEND_URL from environment
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    logger.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: FRONTEND_URL is not set                            ║
║  Server cannot start in production without FRONTEND_URL.                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Add to your .env file:
   FRONTEND_URL=https://your-frontend-domain.com

2. Restart the server

SECURITY NOTE: Never use wildcard origins (*) in production.
`);
    process.exit(1);
  }
  allowedOrigins = [frontendUrl];
  logger.info("CORS: Production mode - Allowing: " + frontendUrl);
}

// Expose allowedOrigins for Socket.io setup in server.js
app.locals.allowedOrigins = allowedOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      // Block requests with no origin (except for same-origin requests)
      if (!origin) {
        if (isDevelopment) {
          logger.warn(
            "CORS: Request with no origin header (allowed in development only)",
          );
          return callback(null, true);
        }
        return callback(
          new Error(
            "CORS: Requests without origin header are blocked in production",
          ),
        );
      }

      // Validate origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Origin not allowed - log and block
      logger.warn("CORS: Blocked request from origin: " + origin);
      callback(
        new Error(`CORS: Origin ${origin} is not allowed by CORS policy`),
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: [],
    maxAge: 86400,
  }),
);

// Body parsing middleware - but multer will handle multipart/form-data
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded files statically
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Database Connection Check + pgvector Init ---
const { initVectorSupport } = require("./config/database");

// In test environment we avoid running pgvector init on every Jest import
// to prevent race conditions and noisy logs. Simple connectivity will still
// be exercised via health checks.
if (process.env.NODE_ENV !== "test") {
  pool.query("SELECT NOW()", async (err, res) => {
    if (err) {
      logger.error(
        "FATAL: Database connection failed. Check db.js and .env: " +
          err.message,
      );
      process.exit(1);
    } else {
      logger.info(
        "PostgreSQL connected successfully. Date: " + res.rows[0].now,
      );
      await initVectorSupport();
    }
  });
}

// --- Rate limiting (production-grade) ---
const {
  globalLimiter,
  attendanceLimiter,
} = require("./middleware/rateLimiter");

// Trust proxy so req.ip is correct behind reverse proxy (nginx, etc.)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Global API limiter: 200 req/15min per IP (applies to all /api)
app.use("/api", globalLimiter);

// --- Prometheus metrics (only when ENABLE_METRICS is set) ---
const metrics = require("./utils/metrics");
app.use(metrics.requestDurationMiddleware);

// --- Routes ---
// Import your route handlers
const authRoutes = require("./routes/auth");
const attendanceRoutes = require("./routes/attendance");
const facultyRoutes = require("./routes/faculty");
const faceRecognitionRoutes = require("./routes/faceRecognition");
const biometricsRoutes = require("./routes/biometrics");
const reportsRoutes = require("./routes/reports");
const registrationsRoutes = require("./routes/registrations");

// Initialize SMS service (Twilio)
require("./utils/sms");

// --- API Endpoints ---
// IMPORTANT: Mount registrations routes BEFORE faculty routes to avoid route conflicts
// registrations.js has routes like /faculty/courses/:courseId/registrations
app.use("/api/registrations", registrationsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/faculty", facultyRoutes);
// Attendance: 30 req/min per IP (stricter than global)
app.use("/api/attendance", attendanceLimiter, attendanceRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/face", faceRecognitionRoutes);
app.use("/api/biometrics", biometricsRoutes);

// Secret admin routes (no backend rewrite, just route)
// Only mount at /inclass/admin for secret URL access
const adminRoutes = require("./routes/admin");
app.use("/inclass/admin", adminRoutes);
// Note: /api/admin routes are handled within adminRoutes for authenticated admin endpoints

// Basic test route
app.get("/", (req, res) =>
  res.send(
    "InClass Backend Running (Endpoints: /api/auth, /api/faculty, /api/attendance, /api/reports, /api/face, /api/biometrics)",
  ),
);

// Enhanced health check handler used by both /health and /api/health
app.get("/health", async (req, res) => {
  const start = Date.now();

  try {
    // Simple database connectivity check
    await pool.query("SELECT 1");

    const memory = process.memoryUsage();

    res.json({
      status: "ok",
      database: "connected",
      uptime: process.uptime(),
      memory,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
    });
  } catch (err) {
    logger.error("Health check database error: " + err.message);

    const memory = process.memoryUsage();

    res.status(500).json({
      status: "error",
      database: "disconnected",
      uptime: process.uptime(),
      memory,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
      error: err.message,
    });
  }
});

// API health endpoint for automated checks and tests (same behavior)
app.get("/api/health", async (req, res) => {
  const start = Date.now();

  try {
    await pool.query("SELECT 1");

    const memory = process.memoryUsage();

    res.json({
      status: "ok",
      database: "connected",
      uptime: process.uptime(),
      memory,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
    });
  } catch (err) {
    logger.error("API health check database error: " + err.message);

    const memory = process.memoryUsage();

    res.status(500).json({
      status: "error",
      database: "disconnected",
      uptime: process.uptime(),
      memory,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
      error: err.message,
    });
  }
});

// Prometheus metrics endpoint (returns 404 when ENABLE_METRICS is not set)
app.get("/metrics", metrics.getMetricsHandler(pool));

// --- Error Handling Middleware (must be last) ---
if (process.env.SENTRY_DSN) {
  const Sentry = require("@sentry/node");
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

module.exports = app;
