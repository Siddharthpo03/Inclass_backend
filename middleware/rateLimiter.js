// inclass-backend/middleware/rateLimiter.js
// Production-grade rate limiting for auth, attendance, and global API protection (SEC-001)

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// IPv6-safe key: use library helper so IPv6 users cannot bypass limits
const keyGen = (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");

// -------- 1. Auth limiter: protect login/register from brute-force --------
// max 5 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: {
      message: "Too many authentication attempts. Please try again after 15 minutes.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  },
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: keyGen,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: "Too many authentication attempts. Please try again after 15 minutes.",
        code: "RATE_LIMIT_EXCEEDED",
      },
    });
  },
  skip: () => process.env.NODE_ENV === "test",
});

// Backward compatibility: same as authLimiter (used on /login)
const loginLimiter = authLimiter;

// -------- 2. Attendance limiter: protect attendance APIs from abuse --------
// max 30 requests per minute per IP (e.g. marking attendance, status checks)
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    success: false,
    error: {
      message: "Too many attendance requests. Please slow down and try again in a minute.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: "Too many attendance requests. Please slow down and try again in a minute.",
        code: "RATE_LIMIT_EXCEEDED",
      },
    });
  },
  skip: () => process.env.NODE_ENV === "test",
});

// -------- 3. Global limiter: protect entire API from overload --------
// max 200 requests per 15 minutes per IP across all /api routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    error: {
      message: "Too many requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      },
    });
  },
  skip: () => process.env.NODE_ENV === "test",
});

// -------- OTP limiters (existing behavior, unchanged) --------
const otpSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: "Please wait before requesting another OTP.",
        code: "OTP_RATE_LIMIT_EXCEEDED",
      },
    });
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: "Too many OTP verification attempts. Please try again later.",
        code: "OTP_VERIFY_RATE_LIMIT_EXCEEDED",
      },
    });
  },
});

module.exports = {
  authLimiter,
  loginLimiter,
  attendanceLimiter,
  globalLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
};
