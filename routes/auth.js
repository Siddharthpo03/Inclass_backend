// inclass-backend/routes/auth.js

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const bcrypt = require("bcrypt");
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

// Utility to generate JWT (requires JWT_SECRET in .env)
// Token expires in 24 hours for security (production best practice)
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "24h", // Production security standard: 24-hour token lifetime
  });
};

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

router.post(
  "/register",
  authLimiter,
  upload.fields([
    { name: "passportPhoto", maxCount: 1 },
    { name: "faceImage", maxCount: 1 },
  ]), // Handle multiple file uploads
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
    const role = req.body.role;
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
    const { email, password, role } = req.body; // Frontend sends email as 'username'

    // Validate required fields
    validateRequired(["email", "password", "role"], req.body);
    validateEmail(email);
    validateRole(role);

    // BLOCK ADMIN LOGIN FROM REGULAR ENDPOINT
    // Admins must use the separate /inclass/admin/login endpoint
    if (role === "admin") {
      throw new AuthenticationError(
        "Admin accounts must use the admin login page at /inclass/admin/login",
      );
    }

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

    // Check role match
    if (user.role !== role) {
      throw new AuthenticationError(
        "Role mismatch. Please select the correct role.",
        { expected: role, actual: user.role },
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
      // Check if student has enrolled face
      const faceCheck = await pool.query(
        `SELECT id FROM biometric_face WHERE user_id = $1 AND is_active = TRUE LIMIT 1`,
        [user.id],
      );

      const hasFace = faceCheck.rowCount > 0;

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
        "SELECT id FROM biometric_face WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
        [user.id],
      );

      console.log(`[Login] ========================================`);
      console.log(
        `[Login] User ${user.id} (${user.role}): Face enrolled = ${
          faceCheck.rowCount > 0
        }`,
      );
      console.log(
        `[Login] Face check query result: ${faceCheck.rowCount} rows`,
      );

      if (faceCheck.rowCount > 0) {
        console.log(`[Login] Face record found for user ${user.id}`);
      } else {
        console.log(
          `[Login] No face record found for user ${user.id} - skipping face verification`,
        );
        console.log(`[Login] ========================================`);
      }

      // If face is enrolled, require face verification
      if (faceCheck.rowCount > 0) {
        const { embedding } = req.body;

        console.log(`[Login] Face enrolled, checking embedding...`);
        console.log(
          `[Login] Embedding provided = ${
            !!embedding && Array.isArray(embedding) && embedding.length > 0
          }`,
        );
        console.log(
          `[Login] Embedding type: ${typeof embedding}, isArray: ${Array.isArray(
            embedding,
          )}, length: ${embedding?.length || 0}`,
        );

        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
          console.log(
            `[Login] ❌ Face verification required for user ${user.id} - returning 400 error`,
          );
          // Return specific error that frontend can catch
          const errorResponse = {
            success: false,
            error: {
              message: "Face verification required. Please capture your face.",
              code: "FACE_VERIFICATION_REQUIRED",
            },
            requiresFaceVerification: true,
          };
          console.log(
            `[Login] Sending error response:`,
            JSON.stringify(errorResponse, null, 2),
          );
          console.log(`[Login] ========================================`);
          // Use res.status().json() and ensure it's returned
          res.status(400).json(errorResponse);
          return; // Explicitly return to prevent further execution
        }

        // Call face verification endpoint logic
        const { decrypt } = require("../utils/crypto");
        const storedResult = await pool.query(
          "SELECT encrypted_embedding FROM biometric_face WHERE user_id = $1 AND is_active = TRUE",
          [user.id],
        );

        if (storedResult.rowCount > 0) {
          // Decrypt stored embedding
          const decryptedEmbedding = JSON.parse(
            decrypt(storedResult.rows[0].encrypted_embedding),
          );

          // Calculate cosine similarity
          function cosineSimilarity(vecA, vecB) {
            if (vecA.length !== vecB.length) {
              return 0;
            }
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < vecA.length; i++) {
              dotProduct += vecA[i] * vecB[i];
              normA += vecA[i] * vecA[i];
              normB += vecB[i] * vecB[i];
            }
            const denominator = Math.sqrt(normA) * Math.sqrt(normB);
            if (denominator === 0) {
              return 0;
            }
            return dotProduct / denominator;
          }

          const similarity = cosineSimilarity(embedding, decryptedEmbedding);
          const threshold = parseFloat(
            process.env.FACE_SIMILARITY_THRESHOLD || "0.62",
          );
          const match = similarity >= threshold;

          if (!match) {
            throw new AuthenticationError(
              "Face mismatch – identity could not be verified.",
            );
          }
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

// @route   POST /api/auth/submit-pending-student
// @desc    Submit student registration for faculty approval
// @access  Public (student submits before login)
router.post(
  "/submit-pending-student",
  asyncHandler(async (req, res) => {
    const { studentId, facultyId } = req.body;

    if (!studentId || !facultyId) {
      throw new ValidationError("Student ID and Faculty ID are required.");
    }

    // Check if student exists
    const studentCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [studentId],
    );
    if (
      studentCheck.rowCount === 0 ||
      studentCheck.rows[0].role !== "student"
    ) {
      throw new NotFoundError("Student not found.");
    }

    // Check if faculty exists
    const facultyCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [facultyId],
    );
    if (
      facultyCheck.rowCount === 0 ||
      facultyCheck.rows[0].role !== "faculty"
    ) {
      throw new NotFoundError("Faculty not found.");
    }

    // Insert or update pending student record
    const result = await pool.query(
      `INSERT INTO pending_students (student_id, faculty_id, status)
       VALUES ($1, $2, 'Pending')
       ON CONFLICT (student_id, faculty_id) 
       DO UPDATE SET status = 'Pending', created_at = CURRENT_TIMESTAMP
       RETURNING id, student_id, faculty_id, status, created_at`,
      [studentId, facultyId],
    );

    res.status(201).json({
      success: true,
      message:
        "Registration request submitted successfully. Faculty will review your application.",
      pendingRequest: result.rows[0],
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
    let params = [];

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
    let params = [];

    if (search && search.trim().length > 0) {
      query += " AND (name ILIKE $1 OR code ILIKE $1)";
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY name ASC";

    // SECURE: Parameterized query (search in params) prevents SQL injection
    console.log("[Departments API] Query:", query, "Params:", params);
    const result = await pool.query(query, params);
    console.log("[Departments API] Found", result.rowCount, "departments");

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
// @desc    Send OTP to user's mobile number via SMS (Twilio)
// @access  Public (during onboarding) or Private
router.post(
  "/send-otp",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const authUser = req.user; // From auth middleware if present

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      throw new ValidationError(
        "User ID is required. Please provide userId in request body or authenticate with a valid token.",
      );
    }

    // Get user mobile number and country code
    const userResult = await pool.query(
      "SELECT id, name, mobile_number, country_code FROM users WHERE id = $1",
      [targetUserId],
    );

    if (userResult.rowCount === 0) {
      throw new NotFoundError("User not found.");
    }

    const user = userResult.rows[0];

    // Validate mobile number exists
    if (!user.mobile_number) {
      throw new ValidationError(
        "Mobile number is required. Please update your profile with a valid mobile number.",
      );
    }

    // Format phone number with country code (E.164 format)
    const countryCode = user.country_code || "+1";
    // Remove any existing + from mobile_number if present
    const cleanMobile = user.mobile_number
      .replace(/^\+/, "")
      .replace(/[\s\-\(\)]/g, "");
    const phoneNumber = countryCode + cleanMobile;

    // Send OTP via SMS using Twilio
    const { sendOtpSms } = require("../utils/sms");
    const smsResult = await sendOtpSms(phoneNumber);

    if (!smsResult.success) {
      console.error("Failed to send OTP SMS:", smsResult.error);
      throw new ValidationError(
        smsResult.error ||
          "Failed to send OTP. Please check your mobile number and try again.",
      );
    }

    // Store verification SID in database for tracking (optional)
    // Note: With Twilio Verify, we don't need to store OTP hash ourselves
    // Twilio handles OTP generation and verification
    await pool.query(
      `INSERT INTO otps (user_id, otp_hash, expires_at, is_used)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT DO NOTHING`,
      [
        targetUserId,
        `twilio_${smsResult.sid}`,
        new Date(Date.now() + 5 * 60 * 1000),
      ], // 5 minutes
    );

    res.json({
      success: true,
      message: "OTP sent successfully to your mobile number.",
      expiresIn: 300, // 5 minutes in seconds
      phoneNumber: phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"), // Masked phone number
    });
  }),
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP using Twilio Verify API
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

    if (!otp || otp.length < 4 || otp.length > 8) {
      throw new ValidationError("Valid OTP code is required (4-8 digits).");
    }

    // Get user mobile number and country code
    const userResult = await pool.query(
      "SELECT id, mobile_number, country_code FROM users WHERE id = $1",
      [targetUserId],
    );

    if (userResult.rowCount === 0) {
      throw new NotFoundError("User not found.");
    }

    const user = userResult.rows[0];

    if (!user.mobile_number) {
      throw new ValidationError(
        "Mobile number not found. Please update your profile.",
      );
    }

    // Format phone number with country code (E.164 format)
    const countryCode = user.country_code || "+1";
    // Remove any existing + from mobile_number if present
    const cleanMobile = user.mobile_number
      .replace(/^\+/, "")
      .replace(/[\s\-\(\)]/g, "");
    const phoneNumber = countryCode + cleanMobile;

    // Verify OTP using Twilio
    const { verifyOtpSms } = require("../utils/sms");
    const verifyResult = await verifyOtpSms(phoneNumber, otp);

    if (!verifyResult.success) {
      throw new AuthenticationError(
        verifyResult.error ||
          "Invalid or expired OTP. Please request a new one.",
      );
    }

    // Mark OTP as used in database (if we stored it)
    await pool.query(
      `UPDATE otps SET is_used = TRUE 
       WHERE user_id = $1 AND is_used = FALSE 
       AND expires_at > CURRENT_TIMESTAMP`,
      [targetUserId],
    );

    res.json({
      success: true,
      message: "OTP verified successfully.",
    });
  }),
);

module.exports = router;
