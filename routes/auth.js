// inclass-backend/routes/auth.js

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  validateRequired,
  validateEmail,
  validateRole,
} = require("../utils/errorHandler");
const {
  authLimiter,
  loginLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
} = require("../middleware/rateLimiter");
const { sendOtpEmail } = require("../utils/email");
const { verifyFace: verifyFaceWithAi } = require("../services/aiFaceClient");

// Utility to generate JWT (requires JWT_SECRET in .env)
// Token expires in 24 hours for security (production best practice)
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "24h", // Production security standard: 24-hour token lifetime
  });
};

const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)
  .map((entry) => entry.replace(/^@/, ""));

function getEmailDomain(email) {
  if (!email || typeof email !== "string") {
    return "";
  }

  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function isAllowedEmailDomain(email) {
  if (allowedEmailDomains.length === 0) {
    return true;
  }

  const domain = getEmailDomain(email);
  if (!domain) {
    return false;
  }

  return allowedEmailDomains.some(
    (allowedDomain) =>
      domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
  );
}

function normalizeOtpPhoneKey(mobileNumber, countryCode) {
  const raw = `${countryCode || ""}${mobileNumber || ""}`
    .replace(/\D/g, "")
    .trim();

  if (!raw) {
    return null;
  }

  return raw.slice(0, 15);
}

function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashOtpCode(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function timingSafeEquals(a, b) {
  const bufferA = Buffer.from(String(a || ""), "hex");
  const bufferB = Buffer.from(String(b || ""), "hex");

  if (bufferA.length !== bufferB.length || bufferA.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return "your college email";
  }

  const [localPart, domainPart] = email.split("@");
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] || "*"}*`
      : `${localPart.slice(0, 2)}***`;
  const domainPieces = domainPart.split(".");
  const maskedDomain = domainPieces
    .map((piece, index) => {
      if (index === domainPieces.length - 1) {
        return piece;
      }
      return piece.length <= 2
        ? `${piece[0] || "*"}*`
        : `${piece.slice(0, 2)}***`;
    })
    .join(".");

  return `${maskedLocal}@${maskedDomain}`;
}

async function loadOtpRecipientByUserId(userId) {
  const userResult = await pool.query(
    "SELECT id, name, email, mobile_number, country_code FROM users WHERE id = $1",
    [userId],
  );

  if (userResult.rowCount === 0) {
    throw new NotFoundError("User not found.");
  }

  const user = userResult.rows[0];

  if (!user.email) {
    throw new ValidationError(
      "Email is required. Please update your profile with a valid college email.",
    );
  }

  if (!isAllowedEmailDomain(user.email)) {
    throw new ValidationError(
      "Email domain is not allowed. Please use your approved college email address.",
    );
  }

  const phoneKey = normalizeOtpPhoneKey(user.mobile_number, user.country_code);
  if (!phoneKey) {
    throw new ValidationError(
      "Mobile number is required for OTP compatibility. Please update your profile.",
    );
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneKey,
  };
}

async function resolveOtpRecipient(req, res, next) {
  try {
    const authUser = req.user;
    const targetUserId = req.body.userId || (authUser ? authUser.id : null);

    if (!targetUserId) {
      throw new ValidationError(
        "User ID is required. Please provide userId in request body or authenticate with a valid token.",
      );
    }

    const recipient = await loadOtpRecipientByUserId(targetUserId);
    req.otpRecipient = recipient;
    req.otpRecipientEmail = recipient.email;
    return next();
  } catch (error) {
    return next(error);
  }
}

// @route   GET /api/auth/check-email
// @desc    Check if email exists and return role (for admin auto-detection)
// @access  Public
// IMPORTANT: This route must be defined BEFORE other routes to avoid conflicts
router.get(
  "/check-email",
  asyncHandler(async (req, res) => {
    const { email } = req.query;

    if (!email) {
      return res.json({ exists: false, role: null });
    }

    // SECURE: Parameterized query prevents SQL injection
    const result = await pool.query("SELECT role FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rowCount === 0) {
      return res.json({ exists: false, role: null });
    }

    res.json({
      exists: true,
      role: result.rows[0].role,
    });
  }),
);

// @route   GET /api/auth/profile
// @desc    Get authenticated user's profile details
// @access  Private
router.get(
  "/profile",
  auth(),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // SECURE: Parameterized query prevents SQL injection
    const result = await pool.query(
      "SELECT name, email, role, roll_no, college, department, college_id, department_id FROM users WHERE id = $1",
      [userId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("User profile");
    }

    const user = result.rows[0];

    // Map data to the structure the frontend expects
    res.json({
      name: user.name,
      role: user.role,
      id: user.roll_no,
      userId: userId,
      email: user.email,
      department:
        user.department ||
        (user.roll_no ? user.roll_no.substring(0, 3) : "N/A"),
      college: user.college || "Tech University",
      college_id: user.college_id,
      department_id: user.department_id,
    });
  }),
);

// @route   POST /api/auth/register
// @desc    Register User (with file upload support)
const upload = require("../middleware/upload");

// Make multer optional: only run it when Content-Type is multipart/form-data
function optionalMultipartFields(fields) {
  return (req, res, next) => {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    if (contentType.startsWith("multipart/form-data")) {
      return upload.fields(fields)(req, res, next);
    }
    // Ensure req.body is at least an empty object for downstream code
    if (!req.body) req.body = {};
    return next();
  };
}

router.post(
  "/register",
  authLimiter,
  optionalMultipartFields([
    { name: "passportPhoto", maxCount: 1 },
    { name: "faceImage", maxCount: 1 },
  ]), // Handle multiple file uploads when present
  asyncHandler(async (req, res) => {
    // Debug: Log what we received
    console.log("📥 Registration request received");
    console.log("📥 Content-Type:", req.headers["content-type"]);
    console.log("📥 req.body:", req.body);
    console.log("📥 req.body type:", typeof req.body);
    console.log("📥 req.body keys:", req.body ? Object.keys(req.body) : "null");
    console.log("📥 req.files:", req.files);
    console.log(
      "📥 passportPhoto:",
      req.files?.passportPhoto
        ? {
            filename: req.files.passportPhoto[0].filename,
            size: req.files.passportPhoto[0].size,
          }
        : null,
    );
    console.log(
      "📥 faceImage:",
      req.files?.faceImage
        ? {
            filename: req.files.faceImage[0].filename,
            size: req.files.faceImage[0].size,
          }
        : null,
    );

    // Check if req.body exists - multer should populate this
    if (!req.body) {
      console.error(
        "❌ req.body is undefined - multer may not have parsed the request",
      );
      console.error(
        "❌ This usually means the request isn't multipart/form-data",
      );
      throw new ValidationError(
        "Request body is missing. Please ensure the form is submitted correctly.",
      );
    }

    if (typeof req.body !== "object") {
      console.error("❌ req.body is not an object:", typeof req.body, req.body);
      throw new ValidationError("Invalid request format. Please try again.");
    }

    // Note: Frontend sends name, email, password, role, roll_no, mobile_number, country_code
    // and passportPhoto as file upload
    // Multer parses form fields into req.body
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const role =
      typeof req.body.role === "string"
        ? req.body.role.trim().toLowerCase()
        : req.body.role;
    const roll_no = req.body.roll_no;
    const mobile_number = req.body.mobile_number;
    const country_code = req.body.country_code;
    const college = req.body.college;
    const department = req.body.department;
    const college_id = req.body.college_id;
    const department_id = req.body.department_id;

    console.log("📥 Parsed values:", {
      name,
      email,
      role,
      roll_no,
      mobile_number,
      country_code,
      college,
      department,
      college_id,
      department_id,
    });

    // Validate required fields - use individual variables
    if (!name || !email || !password || !role) {
      throw new ValidationError(
        "Missing required fields: name, email, password, and role are required.",
      );
    }

    // Validate email format
    validateEmail(email);

    // Validate role
    validateRole(role);

    // Validate mobile number format if provided
    if (
      mobile_number &&
      !/^\d{10,15}$/.test(mobile_number.replace(/\s/g, ""))
    ) {
      throw new ValidationError("Invalid mobile number format");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle passport photo upload
    let passportPhotoUrl = null;
    if (req.files?.passportPhoto && req.files.passportPhoto[0]) {
      // In production, upload to cloud storage (S3, Cloudinary, etc.)
      // For now, store relative path
      passportPhotoUrl = `/uploads/${req.files.passportPhoto[0].filename}`;
      console.log("📸 Passport photo saved:", passportPhotoUrl);
    }

    // Handle face image upload (store for face recognition enrollment)
    let faceImagePath = null;
    if (req.files?.faceImage && req.files.faceImage[0]) {
      faceImagePath = `/uploads/${req.files.faceImage[0].filename}`;
      console.log("👤 Face image saved:", faceImagePath);
    }

    // Validate roll_no uniqueness within college (if roll_no and college_id provided)
    if (roll_no && college_id) {
      const existingRollNo = await pool.query(
        `SELECT id FROM users WHERE roll_no = $1 AND college_id = $2`,
        [roll_no, college_id],
      );

      if (existingRollNo.rowCount > 0) {
        throw new ConflictError(
          `Roll number ${roll_no} already exists in this college. Please use a different roll number.`,
        );
      }
    }

    // Insert user (PostgreSQL will handle unique constraint violations)
    console.log("💾 Inserting user into database...");
    console.log("💾 Values:", {
      name,
      email,
      role,
      roll_no: roll_no || null,
      mobile_number: mobile_number || null,
      country_code: country_code || "+1",
      passport_photo_url: passportPhotoUrl,
    });

    try {
      const result = await pool.query(
        `INSERT INTO users (name, email, password, role, roll_no, mobile_number, country_code, passport_photo_url, college, department, college_id, department_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
         RETURNING id, name, role, mobile_number, country_code, passport_photo_url, college, department, college_id, department_id`,
        [
          name,
          email,
          hashedPassword,
          role,
          roll_no || null,
          mobile_number || null,
          country_code || "+1",
          passportPhotoUrl,
          college || null,
          department || null,
          college_id || null,
          department_id || null,
        ],
      );

      console.log("✅ User inserted successfully, ID:", result.rows[0].id);
      const user = result.rows[0];

      res.status(201).json({
        success: true,
        message: "User registered successfully.",
        user: user,
        token: generateToken(user.id, user.role),
        userId: user.id, // Return userId for biometric enrollment
      });
    } catch (dbError) {
      console.error("❌ ========== DATABASE ERROR ==========");
      console.error("❌ Error message:", dbError.message);
      console.error("❌ Error code:", dbError.code);
      console.error("❌ Error detail:", dbError.detail);
      console.error("❌ Error constraint:", dbError.constraint);
      console.error("❌ Error table:", dbError.table);
      console.error("❌ Error column:", dbError.column);
      console.error("❌ Full error:", JSON.stringify(dbError, null, 2));
      console.error("❌ ====================================");
      throw dbError; // Re-throw to be caught by errorHandler
    }
  }),
);

// @route   POST /api/auth/login
// @desc    Authenticate User
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body; // Frontend sends email as 'username'

    // Validate required fields (role is optional; infer from DB if omitted)
    validateRequired(["email", "password"], req.body);
    validateEmail(email);

    // SECURE: Parameterized query prevents SQL injection (login)
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rowCount === 0) {
      throw new AuthenticationError("Invalid email or password.");
    }

    const user = result.rows[0];

    // Also block if user is admin (even if they didn't select admin role)
    if (user.role === "admin") {
      throw new AuthenticationError(
        "Admin accounts must use the admin login page at /inclass/admin/login",
      );
    }

    // If role was provided by the client, validate it; otherwise infer from DB
    let role =
      typeof req.body.role === "string"
        ? req.body.role.trim().toLowerCase()
        : req.body.role;
    if (role) validateRole(role);

    // If client didn't provide a role, use the stored user role
    role = role || user.role;

    // Ensure client-provided role (if any) matches stored role
    if (role && user.role !== role) {
      throw new AuthenticationError(
        "Role mismatch. Please select the correct role.",
        { expected: role, actual: user.role },
      );
    }

    // BLOCK ADMIN LOGIN FROM REGULAR ENDPOINT
    // Admins must use the separate /inclass/admin/login endpoint
    if (role === "admin") {
      throw new AuthenticationError(
        "Admin accounts must use the admin login page at /inclass/admin/login",
      );
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthenticationError("Invalid email or password.");
    }

    // ============================================
    // STUDENT FIRST-LOGIN FACE ENROLLMENT CHECK
    // ============================================
    // If student role and face not enrolled, block JWT issuance
    if (user.role === "student") {
      const faceCheck = await pool.query(
        `SELECT
           bf.id AS biometric_face_id,
           bf.encrypted_embedding,
           u.embedding AS legacy_embedding,
           u.face_enrolled
         FROM users u
         LEFT JOIN biometric_face bf
           ON bf.user_id = u.id AND bf.is_active = TRUE
         WHERE u.id = $1
         LIMIT 1`,
        [user.id],
      );

      const faceRecord = faceCheck.rows[0] || null;
      const hasFace = Boolean(
        faceRecord?.biometric_face_id ||
        faceRecord?.encrypted_embedding ||
        faceRecord?.legacy_embedding ||
        faceRecord?.face_enrolled,
      );

      // If no face enrollment, block login
      if (!hasFace) {
        console.log(
          `[Login] ❌ Student ${user.id} has no face enrollment - blocking login`,
        );

        return res.status(403).json({
          success: false,
          error: {
            message:
              "Face enrollment required. Please enroll your face to continue.",
            code: "FACE_ENROLLMENT_REQUIRED",
          },
          requiresFaceEnrollment: true,
          userId: user.id,
        });
      }

      console.log(`[Login] ✅ Student ${user.id} face enrollment check passed`);
    }

    // Face verification for students and faculty (only if face is enrolled)
    if (user.role === "student" || user.role === "faculty") {
      const faceCheck = await pool.query(
        `SELECT id, embedding, face_enrolled
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [user.id],
      );

      const faceRecord = faceCheck.rows[0] || null;
      const hasFace = Boolean(
        faceRecord?.face_enrolled || faceRecord?.embedding,
      );

      if (hasFace) {
        const faceImage = req.body.faceImage;

        if (!faceImage) {
          return res.status(400).json({
            success: false,
            error: {
              message: "Face verification required. Please capture your face.",
              code: "FACE_VERIFICATION_REQUIRED",
            },
            requiresFaceVerification: true,
          });
        }

        const verification = await verifyFaceWithAi({
          userId: user.id,
          image: faceImage,
        });

        if (!verification.verified) {
          throw new AuthenticationError(
            verification.instruction ||
              "Face mismatch – identity could not be verified.",
          );
        }
      }
    }

    console.log(
      `[Login] ✅ Login successful for user ${user.id} (${user.role})`,
    );
    console.log(`[Login] ========================================`);
    res.json({
      success: true,
      message: "Login successful.",
      user: { id: user.id, name: user.name, role: user.role },
      token: generateToken(user.id, user.role),
      role: user.role,
    });
  }),
);

// @route   GET /api/auth/faculty-by-college
// @desc    Get faculty members by college name
// @access  Public
router.get(
  "/faculty-by-college",
  asyncHandler(async (req, res) => {
    const { college } = req.query;

    if (!college || college.trim().length === 0) {
      return res.json({ faculty: [] });
    }

    const result = await pool.query(
      "SELECT id, name, email, roll_no FROM users WHERE role = 'faculty' AND college ILIKE $1 ORDER BY name",
      [`%${college.trim()}%`],
    );

    res.json({
      faculty: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        roll_no: row.roll_no,
      })),
    });
  }),
);

// @route   GET /api/auth/colleges
// @desc    Get list of all active colleges/universities
// @access  Public
router.get(
  "/colleges",
  asyncHandler(async (req, res) => {
    const { search } = req.query;

    let query =
      "SELECT id, name, country, state, city, type FROM colleges WHERE is_active = true";
    const params = [];

    if (search && search.trim().length > 0) {
      query += " AND name ILIKE $1";
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY name ASC";

    // SECURE: Parameterized query (search in params) prevents SQL injection
    const result = await pool.query(query, params);

    res.json({
      colleges: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        country: row.country,
        state: row.state,
        city: row.city,
        type: row.type,
      })),
    });
  }),
);

// @route   GET /api/auth/departments
// @desc    Get list of all active departments
// @access  Public
router.get(
  "/departments",
  asyncHandler(async (req, res) => {
    const { search } = req.query;

    let query =
      "SELECT id, name, code, description FROM departments WHERE is_active = true";
    const params = [];

    if (search && search.trim().length > 0) {
      query += " AND (name ILIKE $1 OR code ILIKE $1)";
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY name ASC";

    // SECURE: Parameterized query (search in params) prevents SQL injection
    const result = await pool.query(query, params);

    res.json({
      departments: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        description: row.description,
      })),
    });
  }),
);

// @route   POST /api/auth/send-otp
// @desc    Send OTP to user's college email
// @access  Public (during onboarding) or Private
router.post(
  "/send-otp",
  resolveOtpRecipient,
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const { id: targetUserId, name, email, phoneKey } = req.otpRecipient;

    const otp = generateOtpCode();
    const otpHash = hashOtpCode(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO otps (user_id, email, otp_hash, expires_at)
 VALUES ($1, $2, $3, $4)
 ON CONFLICT (user_id)
 DO UPDATE SET email = EXCLUDED.email,
               otp_hash = EXCLUDED.otp_hash,
               expires_at = EXCLUDED.expires_at`,
      [targetUserId, email, otpHash, expiresAt],
    );

    const { success, error, messageId } = await sendOtpEmail({
      to: email,
      name,
      otp,
      expiresInMinutes: 10,
    });

    if (!success) {
      throw new ValidationError(
        error || "Failed to send OTP via email. Please try again.",
      );
    }

    res.json({
      success: true,
      message: "OTP sent successfully to your college email.",
      expiresIn: 600,
      maskedEmail: maskEmail(email),
      deliveryMethod: "email",
      messageId,
      userId: targetUserId,
    });
  }),
);

// @route   POST /api/auth/verify-otp
// @desc    Verify email OTP
// @access  Public (during onboarding) or Private
router.post(
  "/verify-otp",
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const { userId, otp } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      throw new ValidationError("User ID is required.");
    }

    if (!/^[0-9]{6}$/.test(String(otp || ""))) {
      throw new ValidationError("Valid 6-digit OTP code is required.");
    }

    const recipient = await loadOtpRecipientByUserId(targetUserId);
    const otpResult = await pool.query(
      "SELECT user_id, email, otp_hash, expires_at FROM otps WHERE user_id = $1 AND email = $2 LIMIT 1",
      [targetUserId, recipient.email],
    );

    if (otpResult.rowCount === 0) {
      throw new AuthenticationError(
        "Invalid or expired OTP. Please request a new one.",
      );
    }

    const record = otpResult.rows[0];
    const expiresAt = new Date(record.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await pool.query("DELETE FROM otps WHERE phone = $1 AND email = $2", [
        recipient.phoneKey,
        recipient.email,
      ]);
      throw new AuthenticationError(
        "Invalid or expired OTP. Please request a new one.",
      );
    }

    const hashedInput = hashOtpCode(otp);
    if (!timingSafeEquals(record.otp_hash, hashedInput)) {
      throw new AuthenticationError(
        "Invalid or expired OTP. Please request a new one.",
      );
    }

    // Single-use OTP: delete immediately after successful verification
    await pool.query("DELETE FROM otps WHERE user_id = $1 AND email = $2", [
      targetUserId,
      recipient.email,
    ]);

    res.json({
      success: true,
      message: "OTP verified successfully.",
    });
  }),
);

module.exports = router;
