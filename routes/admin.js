// inclass-backend/routes/admin.js
// Admin routes - secret URL access only

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const {
  asyncHandler,
  ValidationError,
  AuthenticationError,
} = require("../utils/errorHandler");

// Pre-gate passphrase (optional UX layer - not security)
// In production, this should be in .env
const ADMIN_GATE_PASSPHRASE = process.env.ADMIN_GATE_PASSPHRASE || null;

// Utility to generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// @route   GET /inclass/admin/login
// @desc    Secret admin login page (no backend rewrite, just route)
// @access  Public (but secret URL)
router.get("/login", async (req, res) => {
  try {
    // Check if any admin accounts exist (for debugging)
    const adminCount = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    );

    res.json({
      success: true,
      message: "Admin login endpoint accessible",
      requiresPassphrase: !!ADMIN_GATE_PASSPHRASE,
      adminAccountsExist: parseInt(adminCount.rows[0].count) > 0,
      adminCount: parseInt(adminCount.rows[0].count),
    });
  } catch (error) {
    res.json({
      success: true,
      message: "Admin login endpoint accessible",
      requiresPassphrase: !!ADMIN_GATE_PASSPHRASE,
      error: "Could not check admin accounts",
    });
  }
});

// @route   POST /inclass/admin/login/verify-gate
// @desc    Verify pre-gate passphrase (optional UX layer)
// @access  Public
router.post(
  "/login/verify-gate",
  asyncHandler(async (req, res) => {
    if (!ADMIN_GATE_PASSPHRASE) {
      // No passphrase configured - allow access
      return res.json({
        success: true,
        message: "Gate passphrase not configured. Access granted.",
      });
    }

    const { passphrase } = req.body;

    if (!passphrase) {
      throw new ValidationError("Passphrase is required.");
    }

    if (passphrase !== ADMIN_GATE_PASSPHRASE) {
      throw new AuthenticationError("Invalid passphrase.");
    }

    res.json({
      success: true,
      message: "Gate passphrase verified.",
    });
  }),
);

// @route   POST /inclass/admin/login
// @desc    Admin login (after gate verification if configured)
// @access  Public
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError("Email and password are required.");
    }

    // Find admin user - check both email and role
    logger.debug("Admin login attempt for email: " + email);

    // SECURE: Parameterized query prevents SQL injection (admin login)
    const emailCheck = await pool.query(
      "SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    logger.debug(
      "Admin login email check: " +
        emailCheck.rowCount +
        " user(s) found with this email",
    );

    if (emailCheck.rowCount === 0) {
      throw new AuthenticationError(
        "No account found with this email. Admin accounts can only be created by InClass.",
      );
    }

    const emailUser = emailCheck.rows[0];
    logger.debug("Admin account exists. Role: " + emailUser.role);

    // Check if it's an admin
    if (emailUser.role !== "admin") {
      throw new AuthenticationError(
        `This email is registered as ${emailUser.role}, not admin. Admin accounts can only be created by InClass.`,
      );
    }

    // Now get full user data for password verification
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'admin'",
      [emailUser.id],
    );

    logger.debug("Admin query result: " + result.rowCount + " admin(s) found");

    if (result.rowCount === 0) {
      throw new AuthenticationError(
        "Admin account verification failed. Please contact InClass support.",
      );
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AuthenticationError(
        "Invalid password. Please check your credentials.",
      );
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    res.json({
      success: true,
      message: "Admin login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }),
);

// @route   GET /inclass/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Private (Admin only)
const adminOnly = auth(["admin"]);

router.get(
  "/dashboard",
  adminOnly,
  asyncHandler(async (req, res) => {
    // Get admin dashboard data
    const stats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
      (SELECT COUNT(*) FROM users WHERE role = 'faculty') as total_faculty,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') as total_admins,
      (SELECT COUNT(*) FROM classes) as total_classes,
      (SELECT COUNT(*) FROM sessions WHERE is_active = TRUE) as active_sessions
  `);

    res.json({
      success: true,
      stats: stats.rows[0],
    });
  }),
);

module.exports = router;
