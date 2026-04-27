// inclass-backend/routes/fingerprintRecognition.js
// WebAuthn fingerprint enrollment and verification routes

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AuthenticationError,
} = require("../utils/errorHandler");
const {
  generateFingerprintRegistrationOptions,
  verifyFingerprintRegistration,
  generateFingerprintAuthenticationOptions,
  verifyFingerprintAuthentication,
  ORIGIN,
  RP_ID,
} = require("../utils/fingerprintRecognition");
const {
  setAuthenticationChallenge,
  getAuthenticationChallenge,
  clearAuthenticationChallenge,
} = require("../middleware/biometricAuth");

// Store registration challenges temporarily (in production, use Redis or database)
const registrationChallenges = new Map();
const authenticationChallenges = new Map(); // Also store here for cleanup

// Clean up old challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of registrationChallenges.entries()) {
    if (now - value.timestamp > 300000) {
      // 5 minutes
      registrationChallenges.delete(key);
    }
  }
  // Get authentication challenges from middleware if available
  try {
    const { getAuthenticationChallenge } = require("../middleware/biometricAuth");
    // Note: The middleware manages its own challenges, but we keep this for compatibility
  } catch (e) {
    // Middleware not available, use local map
    for (const [key, value] of authenticationChallenges.entries()) {
      if (now - value.timestamp > 300000) {
        // 5 minutes
        authenticationChallenges.delete(key);
      }
    }
  }
}, 300000);

// @route   POST /api/fingerprint/enroll/start
// @desc    Start fingerprint enrollment (generate registration options)
// @access  Private
router.post("/enroll/start", auth(), async (req, res) => {
  const userId = req.user.id;

  try {
    // Get user info
    const userResult = await pool.query(
      "SELECT name, email FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = userResult.rows[0];

    // Get existing credentials for this user
    const existingCredentials = await pool.query(
      "SELECT credential_id FROM fingerprint_data WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );

    // Generate registration options
    const options = generateFingerprintRegistrationOptions(
      userId.toString(),
      user.email || user.name,
      existingCredentials.rows
    );

    // Store challenge temporarily
    registrationChallenges.set(userId.toString(), {
      challenge: options.challenge,
      timestamp: Date.now(),
    });

    // Convert Uint8Array user.id to base64url string for JSON serialization
    const { isoBase64URL } = require("@simplewebauthn/server/helpers");
    
    // Serialize excludeCredentials if they exist
    const excludeCredentials = options.excludeCredentials ? options.excludeCredentials.map(cred => ({
      id: typeof cred.id === 'string' ? cred.id : isoBase64URL.fromBuffer(cred.id),
      type: cred.type,
      transports: cred.transports,
    })) : [];

    const serializedOptions = {
      challenge: options.challenge, // Already base64url string
      rp: {
        id: RP_ID,
        name: "InClass Attendance System",
      },
      user: {
        id: isoBase64URL.fromBuffer(options.user.id), // Convert Uint8Array to base64url string
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams || [{ alg: -7, type: "public-key" }],
      authenticatorSelection: options.authenticatorSelection || {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: options.timeout || 60000,
      attestation: options.attestation || "none",
    };

    // Add excludeCredentials only if there are any
    if (excludeCredentials.length > 0) {
      serializedOptions.excludeCredentials = excludeCredentials;
    }

    console.log("📤 Sending registration options:", {
      hasChallenge: !!serializedOptions.challenge,
      hasUser: !!serializedOptions.user,
      hasUserId: !!serializedOptions.user?.id,
      userIdType: typeof serializedOptions.user?.id,
      challengeType: typeof serializedOptions.challenge,
      challengeValue: serializedOptions.challenge?.substring(0, 20) + "...",
      userIdValue: serializedOptions.user?.id?.substring(0, 20) + "...",
    });

    res.json(serializedOptions);
  } catch (err) {
    console.error("Fingerprint enrollment start error:", err);
    res.status(500).json({ error: "Server error starting fingerprint enrollment." });
  }
});

// @route   POST /api/fingerprint/enroll/complete
// @desc    Complete fingerprint enrollment (verify and store credential)
// @access  Private
router.post("/enroll/complete", auth(), async (req, res) => {
  const userId = req.user.id;
  const { registrationResponse, deviceName } = req.body;

  try {
    if (!registrationResponse) {
      return res.status(400).json({ message: "Registration response is required." });
    }

    // Get stored challenge
    const storedChallenge = registrationChallenges.get(userId.toString());
    if (!storedChallenge) {
      return res.status(400).json({ message: "Registration session expired. Please start a new enrollment." });
    }

    // Verify registration response
    const verification = await verifyFingerprintRegistration(
      registrationResponse,
      storedChallenge.challenge
    );

    if (!verification.verified) {
      return res.status(400).json({
        message: verification.error || "Fingerprint enrollment verification failed.",
      });
    }

    // Store credential in database
    await pool.query(
      `INSERT INTO fingerprint_data (user_id, credential_id, public_key, device_name, counter, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [
        userId,
        verification.credentialID,
        verification.publicKey,
        deviceName || "Unknown Device",
        verification.counter,
      ]
    );

    // Clean up challenge
    registrationChallenges.delete(userId.toString());

    res.status(201).json({
      message: "Fingerprint enrolled successfully.",
      credentialId: verification.credentialID,
    });
  } catch (err) {
    console.error("Fingerprint enrollment complete error:", err);
    if (err.code === "23505") {
      // Unique constraint violation
      return res.status(400).json({ message: "This fingerprint is already enrolled." });
    }
    res.status(500).json({ error: "Server error completing fingerprint enrollment." });
  }
});

// @route   POST /api/fingerprint/verify/start
// @desc    Start fingerprint verification (generate authentication options)
// @access  Private
router.post("/verify/start", auth(), async (req, res) => {
  const userId = req.user.id;

  try {
    // Get user's enrolled credentials
    const credentials = await pool.query(
      "SELECT credential_id FROM fingerprint_data WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );

    if (credentials.rowCount === 0) {
      return res.status(404).json({
        message: "No fingerprint enrollment found. Please enroll your fingerprint first.",
        enrolled: false,
      });
    }

    // Generate authentication options
    const options = generateFingerprintAuthenticationOptions(credentials.rows);

    // Store challenge using middleware helper
    setAuthenticationChallenge(userId, options.challenge);

    res.json(options);
  } catch (err) {
    console.error("Fingerprint verification start error:", err);
    res.status(500).json({ error: "Server error starting fingerprint verification." });
  }
});

// @route   POST /api/fingerprint/verify/complete
// @desc    Complete fingerprint verification (verify authentication response)
// @access  Private
router.post("/verify/complete", auth(), async (req, res) => {
  const userId = req.user.id;
  const { authenticationResponse } = req.body;

  try {
    if (!authenticationResponse) {
      return res.status(400).json({ message: "Authentication response is required." });
    }

    // Get stored challenge using middleware helper
    const storedChallenge = getAuthenticationChallenge(userId);
    if (!storedChallenge) {
      return res.status(400).json({ message: "Verification session expired. Please start a new verification." });
    }

    // Get credential from database
    const credentialId = authenticationResponse.id;
    const credentialResult = await pool.query(
      "SELECT credential_id, public_key, counter FROM fingerprint_data WHERE credential_id = $1 AND user_id = $2 AND is_active = TRUE",
      [credentialId, userId]
    );

    if (credentialResult.rowCount === 0) {
      return res.status(404).json({ message: "Credential not found." });
    }

    const credential = credentialResult.rows[0];

    // Verify authentication response
    const verification = await verifyFingerprintAuthentication(
      authenticationResponse,
      storedChallenge.challenge,
      credential,
      credential.counter
    );

    if (!verification.verified) {
      return res.status(400).json({
        message: verification.error || "Fingerprint verification failed.",
        verified: false,
      });
    }

    // Update counter and last used timestamp
    await pool.query(
      "UPDATE fingerprint_data SET counter = $1, last_used_at = CURRENT_TIMESTAMP WHERE credential_id = $2",
      [verification.newCounter, credentialId]
    );

    // Clean up challenge using middleware helper
    clearAuthenticationChallenge(userId);

    res.json({
      verified: true,
      message: "Fingerprint verified successfully.",
      credentialId: credentialId,
    });
  } catch (err) {
    console.error("Fingerprint verification complete error:", err);
    res.status(500).json({ error: "Server error completing fingerprint verification." });
  }
});

// @route   GET /api/fingerprint/status
// @desc    Get user's fingerprint enrollment status
// @access  Private
router.get("/status", auth(), async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, credential_id, device_name, enrolled_at, last_used_at, counter
       FROM fingerprint_data
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY enrolled_at DESC`,
      [userId]
    );

    res.json({
      enrolled: result.rowCount > 0,
      credentials: result.rows.map((row) => ({
        id: row.id,
        deviceName: row.device_name,
        enrolledAt: row.enrolled_at,
        lastUsedAt: row.last_used_at,
        counter: row.counter,
      })),
      count: result.rowCount,
    });
  } catch (err) {
    console.error("Fingerprint status error:", err);
    res.status(500).json({ error: "Server error checking fingerprint status." });
  }
});

// @route   DELETE /api/fingerprint/enroll/:credentialId
// @desc    Delete a fingerprint enrollment
// @access  Private
router.delete("/enroll/:credentialId", auth(), async (req, res) => {
  const userId = req.user.id;
  const { credentialId } = req.params;

  try {
    const result = await pool.query(
      "UPDATE fingerprint_data SET is_active = FALSE WHERE credential_id = $1 AND user_id = $2",
      [credentialId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Fingerprint enrollment not found." });
    }

    res.json({ message: "Fingerprint enrollment deleted successfully." });
  } catch (err) {
    console.error("Fingerprint deletion error:", err);
    res.status(500).json({ error: "Server error deleting fingerprint enrollment." });
  }
});

// ============================================
// SKELETON ENDPOINTS FOR FACULTY-ONLY FINGERPRINT REGISTRATION
// These are placeholders for vendor-specific fingerprint SDK integration
// ============================================

// @route   POST /api/fingerprint/register/options
// @desc    Start fingerprint registration session (faculty-only, for student enrollment)
// @access  Private (faculty)
router.post(
  "/register/options",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const { studentId } = req.body;
    const facultyId = req.user.id;

    if (!studentId) {
      throw new ValidationError("Student ID is required.");
    }

    // Verify student exists
    const studentCheck = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1 AND role = 'student'",
      [studentId]
    );

    if (studentCheck.rowCount === 0) {
      throw new NotFoundError("Student not found.");
    }

    const student = studentCheck.rows[0];

    // Generate a session token for this registration
    const crypto = require("crypto");
    const sessionToken = crypto.randomBytes(32).toString("hex");

    // Store session in database (or Redis in production)
    // For now, we'll use a simple in-memory store
    registrationChallenges.set(sessionToken, {
      studentId: studentId,
      facultyId: facultyId,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      sessionToken: sessionToken,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
      },
      message: "Fingerprint registration session created. Use this sessionToken in the complete endpoint.",
      note: "This is a skeleton endpoint. Integrate with your fingerprint vendor SDK here.",
    });
  })
);

// @route   POST /api/fingerprint/register/complete
// @desc    Complete fingerprint registration (faculty-only, accepts encrypted template)
// @access  Private (faculty)
router.post(
  "/register/complete",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const { sessionToken, studentId, encryptedTemplate, vendor } = req.body;
    const facultyId = req.user.id;

    if (!sessionToken || !studentId || !encryptedTemplate) {
      throw new ValidationError("Session token, student ID, and encrypted template are required.");
    }

    // Verify session
    const session = registrationChallenges.get(sessionToken);
    if (!session || session.studentId !== parseInt(studentId) || session.facultyId !== facultyId) {
      throw new AuthenticationError("Invalid or expired session token.");
    }

    // Verify student exists
    const studentCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'student'",
      [studentId]
    );

    if (studentCheck.rowCount === 0) {
      throw new NotFoundError("Student not found.");
    }

    // Encrypt the template (if not already encrypted)
    const { encrypt } = require("../utils/crypto");
    let finalEncryptedTemplate;
    try {
      // If it's already a string, assume it's encrypted; otherwise encrypt it
      if (typeof encryptedTemplate === "string") {
        finalEncryptedTemplate = encryptedTemplate;
      } else {
        finalEncryptedTemplate = encrypt(JSON.stringify(encryptedTemplate));
      }
    } catch (error) {
      throw new ValidationError("Failed to encrypt fingerprint template.");
    }

    // Store fingerprint template
    await pool.query(
      `INSERT INTO fingerprint_templates (user_id, student_id, encrypted_template, vendor, enrolled_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [studentId, studentId, finalEncryptedTemplate, vendor || "custom", facultyId]
    );

    // Set fingerprint_enrolled flag
    await pool.query(
      "UPDATE users SET fingerprint_enrolled = TRUE WHERE id = $1",
      [studentId]
    );

    // Clean up session
    registrationChallenges.delete(sessionToken);

    res.json({
      success: true,
      message: "Fingerprint template stored successfully.",
      note: "This is a skeleton endpoint. Full vendor SDK integration required for production.",
    });
  })
);

module.exports = router;

