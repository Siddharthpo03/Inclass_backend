// @ts-check
// inclass-backend/routes/biometrics.js
// Complete biometric onboarding and verification routes

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const auth = require("../middleware/auth");
const sendMail = require("../utils/mailer");
const logger = require("../utils/logger");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const {
  isoBase64URL,
  isoUint8Array,
} = require("@simplewebauthn/server/helpers");
const { encrypt, decrypt, secureLog } = require("../utils/crypto");
const {
  setAuthenticationChallenge,
  getAuthenticationChallenge,
  clearAuthenticationChallenge,
} = require("../middleware/biometricAuth");
const { extractEmbedding, isFaceNetAvailable } = require("../services/facenet");
const { saveUserEmbedding, findBestMatch } = require("../services/faceMatcher");

// WebAuthn configuration - supports separate student/faculty domains
// RP_ID must be explicitly configured for production; in development/tests we
// safely default to "localhost" for convenience.
const NODE_ENV = process.env.NODE_ENV || "development";

let RP_ID;

if (!process.env.WEBAUTHN_RP_ID) {
  if (NODE_ENV === "production") {
    throw new Error(
      "CRITICAL SECURITY ERROR: WEBAUTHN_RP_ID must be set in production."
    );
  } else {
    RP_ID = "localhost";
  }
} else {
  RP_ID = process.env.WEBAUTHN_RP_ID;
}
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "InClass Attendance System";

// Additional hardening: never allow localhost RP_ID in production
if (NODE_ENV === "production" && RP_ID === "localhost") {
  throw new Error(
    "CRITICAL SECURITY ERROR: WEBAUTHN_RP_ID cannot be 'localhost' in production."
  );
}

logger.info(`WebAuthn configured for RP_ID: ${RP_ID}`);

// ORIGIN is determined dynamically from request origin
// This allows WebAuthn to work with both student.* and faculty.* subdomains
function getWebAuthnOrigin(req) {
  // Get origin from request headers
  const origin = req.headers.origin || req.headers.referer;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      return origin;
    } catch {
      // Fallback to env vars
    }
  }

  // Fallback to environment variables
  return (
    process.env.WEBAUTHN_ORIGIN ||
    process.env.STUDENT_FRONTEND_URL ||
    process.env.FACULTY_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  );
}

// In production, strictly enforce that the request Origin header matches the RP_ID.
// Example: RP_ID = "inclass.example.com" => origin must be "https://inclass.example.com".
function validateWebAuthnOrigin(req, res) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const originHeader = req.headers.origin;
  const expectedOrigin = `https://${RP_ID}`;

  if (!originHeader || originHeader !== expectedOrigin) {
    logger.warn(
      "[WebAuthn] Forbidden WebAuthn origin:",
      "received=",
      originHeader || "none",
      "expected=",
      expectedOrigin
    );

    res.status(403).json({
      success: false,
      message: "Forbidden WebAuthn origin.",
    });
    return false;
  }

  return true;
}

// Store registration challenges temporarily (in production, use Redis)
const registrationChallenges = new Map();

// Clean up old challenges every 5 minutes (skip in tests to avoid open handles)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of registrationChallenges.entries()) {
      if (now - value.timestamp > 300000) {
        registrationChallenges.delete(key);
      }
    }
  }, 300000);
}

// ============================================
// WEBAUTHN ROUTES
// ============================================

// @route   POST /api/biometrics/webauthn/register/options
// @desc    Generate WebAuthn registration options
// @access  Public (during onboarding) or Private
router.post("/webauthn/register/options", async (req, res) => {
  try {
    const { userId } = req.body;
    const authUser = req.user; // From auth middleware if present

    // Get userId from body or auth token
    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message:
          "User ID is required. Please provide userId in request body or authenticate with a valid token.",
      });
    }

    logger.info(
      `[WebAuthn] Generating registration options for userId: ${targetUserId}`
    );

    // Get user info
    // SECURE: Parameterized query prevents SQL injection (biometric/webauthn)
    let userResult;
    try {
      userResult = await pool.query(
        "SELECT name, email FROM users WHERE id = $1",
        [targetUserId]
      );
    } catch (dbError) {
      logger.error("[WebAuthn] Database error fetching user:", dbError);
      return res.status(500).json({
        success: false,
        message: `Database error: ${dbError.message}. Check if users table exists.`,
      });
    }

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `User not found with ID: ${targetUserId}`,
      });
    }

    const user = userResult.rows[0];

    // Get existing credentials for this user (handle case where table doesn't exist yet)
    let existingCredentials = { rows: [] };
    try {
      const credResult = await pool.query(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id = $1 AND is_active = TRUE",
        [targetUserId]
      );
      existingCredentials = credResult;
    } catch (dbError) {
      // Table might not exist - log but continue (will create on first enrollment)
      console.warn(
        "[WebAuthn] Could not fetch existing credentials (table may not exist):",
        dbError.message
      );
      existingCredentials = { rows: [] };
    }

    // Generate registration options
    let options;
    try {
      options = generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: isoUint8Array.fromUTF8String(targetUserId.toString()),
        userName: user.email || user.name || `user_${targetUserId}`,
        userDisplayName: user.name || `User ${targetUserId}`,
        timeout: 60000,
        attestationType: "none",
        excludeCredentials: existingCredentials.rows.map((cred) => ({
          id: isoBase64URL.toBuffer(cred.credential_id),
          type: "public-key",
          transports: ["internal"],
        })),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          requireResidentKey: false,
        },
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch (genError) {
      console.error(
        "[WebAuthn] Error generating registration options:",
        genError.message
      );
      return res.status(500).json({
        success: false,
        message:
          "Failed to generate registration options. Please contact support if this persists.",
      });
    }

    // Store challenge temporarily (in-memory cache)
    const challengeString =
      typeof options.challenge === "string"
        ? options.challenge
        : isoBase64URL.fromBuffer(options.challenge);

    registrationChallenges.set(targetUserId.toString(), {
      challenge: challengeString,
      timestamp: Date.now(),
    });

    logger.info(`[WebAuthn] Challenge stored for userId: ${targetUserId}`);

    // Serialize options for JSON response (convert ArrayBuffers to base64url strings)
    const serializedOptions = {
      challenge: challengeString,
      rp: {
        id: RP_ID,
        name: RP_NAME,
      },
      user: {
        id: isoBase64URL.fromBuffer(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams || [
        { alg: -7, type: "public-key" },
      ],
      authenticatorSelection: options.authenticatorSelection || {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: options.timeout || 60000,
      attestation: options.attestation || "none",
    };

    if (options.excludeCredentials && options.excludeCredentials.length > 0) {
      serializedOptions.excludeCredentials = options.excludeCredentials.map(
        (cred) => ({
          id: isoBase64URL.fromBuffer(cred.id),
          type: cred.type,
          transports: cred.transports || ["internal"],
        })
      );
    }

    console.log(
      `[WebAuthn] Returning registration options for userId: ${targetUserId}`
    );
    res.json(serializedOptions);
  } catch (err) {
    logger.error("[WebAuthn] Registration options error:", err.message);
    // Delegate to centralized error handler
    next(err);
  }
});

// @route   POST /api/biometrics/webauthn/register/complete
// @desc    Complete WebAuthn registration
// @access  Public (during onboarding) or Private
router.post("/webauthn/register/complete", async (req, res) => {
  try {
    const { userId, registrationResponse, deviceName } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    if (!registrationResponse) {
      return res.status(400).json({
        success: false,
        message: "Registration response is required.",
      });
    }

    // Enforce strict origin/RP_ID binding in production
    if (!validateWebAuthnOrigin(req, res)) {
      return;
    }

    console.log(
      `[WebAuthn] Completing registration for userId: ${targetUserId}`
    );

    // Get stored challenge
    const storedChallenge = registrationChallenges.get(targetUserId.toString());
    if (!storedChallenge) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired. Please start a new enrollment.",
      });
    }

    // Convert base64url strings from client to ArrayBuffers for verification
    // Client sends: { id, rawId (base64url), response: { clientDataJSON (base64url), attestationObject (base64url) } }
    const response = {
      id: registrationResponse.id,
      rawId:
        typeof registrationResponse.rawId === "string"
          ? isoBase64URL.toBuffer(registrationResponse.rawId)
          : registrationResponse.rawId,
      response: {
        clientDataJSON:
          typeof registrationResponse.response?.clientDataJSON === "string"
            ? isoBase64URL.toBuffer(
                registrationResponse.response.clientDataJSON
              )
            : registrationResponse.response?.clientDataJSON,
        attestationObject:
          typeof registrationResponse.response?.attestationObject === "string"
            ? isoBase64URL.toBuffer(
                registrationResponse.response.attestationObject
              )
            : registrationResponse.response?.attestationObject,
      },
      type: registrationResponse.type || "public-key",
    };

    logger.info(`[WebAuthn] Verifying registration response...`);

    // Get origin for WebAuthn verification
    const dynamicOrigin = getWebAuthnOrigin(req);
    const expectedOrigin = `https://${RP_ID}`;
    const verificationOrigin =
      process.env.NODE_ENV === "production" ? expectedOrigin : dynamicOrigin;

    // Verify registration response
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: verificationOrigin,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (verifyError) {
      logger.error("[WebAuthn] Verification error:", verifyError.message);
      return res.status(400).json({
        success: false,
        message:
          "Verification failed. Please ensure your device time and origin are correct, then try again.",
      });
    }

    if (!verification.verified || !verification.registrationInfo) {
      console.error(
        "[WebAuthn] Verification failed - not verified or missing registration info"
      );
      return res.status(400).json({
        success: false,
        message: "Registration verification failed. Please try again.",
      });
    }

    const { credentialID, credentialPublicKey, counter } =
      verification.registrationInfo;

    logger.info(`[WebAuthn] Verification successful, storing credential...`);


    // Store credential in database
    const credentialIdString = isoBase64URL.fromBuffer(credentialID);
    try {
      await pool.query(
        `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, device_name, counter, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [
          targetUserId,
          credentialIdString,
          isoBase64URL.fromBuffer(credentialPublicKey),
          deviceName || "Unknown Device",
          counter || 0,
        ]
      );
    } catch (dbError) {
      logger.error("[WebAuthn] Database error storing credential:", dbError);
      if (dbError.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "This biometric is already enrolled.",
        });
      }
      // Check if table doesn't exist
      if (dbError.code === "42P01") {
        return res.status(500).json({
          success: false,
          message: `Database table 'webauthn_credentials' does not exist. Please run the schema.sql migration.`,
        });
      }
      throw dbError;
    }


    // Clean up challenge
    registrationChallenges.delete(targetUserId.toString());

    console.log(
      `[WebAuthn] Registration completed successfully for userId: ${targetUserId}`
    );

    const responseData = {
      success: true,
      message: "Device biometric enrolled successfully.",
      credentialId: credentialIdString,
    };


    res.status(201).json(responseData);
  } catch (err) {
    logger.error("[WebAuthn] Registration complete error:", err.message);
    // Delegate to centralized error handler
    next(err);
  }
});

// @route   POST /api/biometrics/webauthn/auth/options
// @desc    Generate WebAuthn authentication options
// @access  Public (during onboarding) or Private
router.post("/webauthn/auth/options", async (req, res) => {
  try {
    const { userId } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // Get user's enrolled credentials
    const credentials = await pool.query(
      "SELECT credential_id FROM webauthn_credentials WHERE user_id = $1 AND is_active = TRUE",
      [targetUserId]
    );

    if (credentials.rowCount === 0) {
      return res.status(404).json({
        message:
          "No biometric enrollment found. Please enroll your biometric first.",
        enrolled: false,
      });
    }

    // Enforce strict origin/RP_ID binding in production
    if (!validateWebAuthnOrigin(req, res)) {
      return;
    }

    // Generate authentication options
    const options = generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.rows.map((cred) => ({
        id: isoBase64URL.toBuffer(cred.credential_id),
        type: "public-key",
        transports: ["internal"],
      })),
      userVerification: "required",
      timeout: 60000,
    });

    // Store challenge using middleware helper
    setAuthenticationChallenge(targetUserId, options.challenge);

    // Serialize for JSON
    const serializedOptions = {
      challenge: options.challenge,
      allowCredentials: options.allowCredentials.map((cred) => ({
        id: isoBase64URL.fromBuffer(cred.id),
        type: cred.type,
        transports: cred.transports,
      })),
      timeout: options.timeout,
      userVerification: options.userVerification,
    };

    res.json(serializedOptions);
  } catch (err) {
    logger.error("WebAuthn authentication options error:", err);
    res
      .status(500)
      .json({ error: "Server error generating authentication options." });
  }
});

// @route   POST /api/biometrics/webauthn/auth/complete
// @desc    Complete WebAuthn authentication
// @access  Public (during onboarding) or Private
router.post("/webauthn/auth/complete", async (req, res) => {
  try {
    const { userId, authenticationResponse } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    if (!authenticationResponse) {
      return res
        .status(400)
        .json({ message: "Authentication response is required." });
    }

    // Get stored challenge
    const storedChallenge = getAuthenticationChallenge(targetUserId);
    if (!storedChallenge) {
      return res.status(400).json({
        message:
          "Authentication session expired. Please start a new verification.",
      });
    }

    // Get credential from database
    const credentialId = authenticationResponse.id;
    const credentialResult = await pool.query(
      "SELECT credential_id, public_key, counter FROM webauthn_credentials WHERE credential_id = $1 AND user_id = $2 AND is_active = TRUE",
      [credentialId, targetUserId]
    );

    if (credentialResult.rowCount === 0) {
      return res.status(404).json({ message: "Credential not found." });
    }

    const credential = credentialResult.rows[0];

    // Convert authentication response to proper format
    const response = {
      id: authenticationResponse.id,
      rawId: isoBase64URL.toBuffer(authenticationResponse.id),
      response: {
        clientDataJSON: isoBase64URL.toBuffer(
          authenticationResponse.response.clientDataJSON
        ),
        authenticatorData: isoBase64URL.toBuffer(
          authenticationResponse.response.authenticatorData
        ),
        signature: isoBase64URL.toBuffer(
          authenticationResponse.response.signature
        ),
        userHandle: authenticationResponse.response.userHandle
          ? isoBase64URL.toBuffer(authenticationResponse.response.userHandle)
          : null,
      },
      type: authenticationResponse.type || "public-key",
    };

    // Enforce strict origin/RP_ID binding in production
    if (!validateWebAuthnOrigin(req, res)) {
      return;
    }

    // Get origin for WebAuthn verification
    const dynamicOrigin = getWebAuthnOrigin(req);
    const expectedOrigin = `https://${RP_ID}`;
    const verificationOrigin =
      process.env.NODE_ENV === "production" ? expectedOrigin : dynamicOrigin;

    // Verify authentication response
    const verification = await verifyAuthenticationResponse({
      response: response,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: verificationOrigin,
      expectedRPID: RP_ID,
      credential: {
        id: isoBase64URL.toBuffer(credential.credential_id),
        publicKey: isoBase64URL.toBuffer(credential.public_key),
        counter: credential.counter,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return res.status(400).json({
        message: "Biometric verification failed.",
        verified: false,
      });
    }

    // Update counter and last used timestamp
    await pool.query(
      "UPDATE webauthn_credentials SET counter = $1, last_used_at = CURRENT_TIMESTAMP WHERE credential_id = $2",
      [verification.authenticationInfo.newCounter, credentialId]
    );

    // Clean up challenge
    clearAuthenticationChallenge(targetUserId);

    res.json({
      verified: true,
      message: "Biometric verified successfully.",
      credentialId: credentialId,
    });
  } catch (err) {
    logger.error("WebAuthn authentication complete error:", err);
    res.status(500).json({ error: "Server error completing authentication." });
  }
});

// ============================================
// FACE RECOGNITION ROUTES
// ============================================

// @route   POST /api/biometrics/face/enroll
// @desc    Enroll user's face by accepting one or more base64 images or a precomputed embedding
// @access  Public (during onboarding) or Private
router.post("/face/enroll", async (req, res) => {
  try {
    const { userId, images, embedding } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ 
        success: false,
        message: "User ID is required." 
      });
    }

    let faceDescriptor = null;

    // If images are provided, process them to extract FaceNet embeddings and average them
    if (images && Array.isArray(images) && images.length > 0) {
      try {
        const descriptors = [];
        for (const imageBase64 of images) {
          const base64Data = imageBase64.replace(
            /^data:image\/\w+;base64,/,
            ""
          );
          const buf = Buffer.from(base64Data, "base64");
          const descriptor = await extractEmbedding(buf);
          if (descriptor) {
            descriptors.push(descriptor);
          }
        }

        if (descriptors.length === 0) {
          return res.status(400).json({
            success: false,
            message:
              "No face detected in any of the provided images. Please ensure your face is clearly visible.",
          });
        }

        if (descriptors.length > 1) {
          const dim = descriptors[0].length;
          const avg = new Array(dim).fill(0);
          for (let i = 0; i < dim; i++) {
            let sum = 0;
            for (const desc of descriptors) {
              sum += desc[i];
            }
            avg[i] = sum / descriptors.length;
          }
          faceDescriptor = avg;
        } else {
          faceDescriptor = descriptors[0];
        }
      } catch (faceError) {
        secureLog("FaceNet extraction error", {
          operationStatus: "error",
          userId: targetUserId,
        });
        return res.status(400).json({
          success: false,
          message:
            "Failed to process face images. Please try again with clearer images.",
        });
      }
    } else if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      // Direct embedding provided (for advanced clients)
      faceDescriptor = embedding;
    } else {
      return res.status(400).json({
        success: false,
        message: "Either images array or embedding array is required.",
      });
    }

    if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 512) {
      return res.status(400).json({
        success: false,
        message: "Face embedding must be 512 dimensions.",
      });
    }

    const encryptedEmbedding = encrypt(JSON.stringify(faceDescriptor));

    // Check if user already has a face enrolled
    const existingCheck = await pool.query(
      "SELECT id FROM biometric_face WHERE user_id = $1 AND is_active = TRUE",
      [targetUserId]
    );

    // Persist embedding in users table for pgvector-based recognition
    await saveUserEmbedding(targetUserId, faceDescriptor);

    if (existingCheck.rowCount > 0) {
      // Update existing enrollment
      await pool.query(
        `UPDATE biometric_face 
         SET encrypted_embedding = $1, enrolled_at = CURRENT_TIMESTAMP, is_active = TRUE
         WHERE user_id = $2`,
        [encryptedEmbedding, targetUserId]
      );

      return res.json({
        success: true,
        message: "Face enrollment updated successfully.",
      });
    } else {
      // Create new enrollment
      await pool.query(
        `INSERT INTO biometric_face (user_id, encrypted_embedding, is_active)
         VALUES ($1, $2, TRUE)`,
        [targetUserId, encryptedEmbedding]
      );

      // Set face_enrolled flag in users table
      await pool.query("UPDATE users SET face_enrolled = TRUE WHERE id = $1", [
        targetUserId,
      ]);

      return res.status(201).json({
        success: true,
        message: "Face enrolled successfully.",
      });
    }
  } catch (err) {
    secureLog("Face enrollment error", {
      operationStatus: "error",
      userId: targetUserId,
    });
    res.status(500).json({
      success: false,
      error: "Server error during face enrollment.",
      message: "An error occurred. Please try again.",
    });
  }
});

// @route   POST /api/biometrics/face/verify
// @desc    Verify user's face against stored enrollment using FaceNet embeddings
// @access  Public (during onboarding) or Private
router.post("/face/verify", async (req, res) => {
  try {
    const { userId, embedding } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      return res
        .status(400)
        .json({ message: "Face embedding array is required." });
    }

    if (embedding.length !== 512) {
      return res.status(400).json({
        message: "Face embedding must be 512 dimensions.",
      });
    }

    // Use pgvector nearest-neighbor search and ensure best match is the target user
    const bestMatch = await findBestMatch(embedding);

    if (!bestMatch) {
      return res.status(404).json({
        message: "No face enrollment found. Please enroll your face first.",
        enrolled: false,
      });
    }

    const match =
      bestMatch.match && parseInt(bestMatch.userId, 10) === targetUserId;
    const similarity = 1 - bestMatch.distance;

    res.json({
      verified: match,
      score: similarity,
      threshold: 1 - bestMatch.threshold,
      message: match
        ? "Face verified successfully."
        : "Face verification failed. Please try again with better lighting and a clear view of your face.",
    });
  } catch (err) {
    secureLog("Face verification error", {
      operationStatus: "error",
      userId: targetUserId,
    });
    res.status(500).json({ error: "Server error during face verification." });
  }
});

// @route   POST /api/biometrics/face/verify-at-login
// @desc    Verify user's face during login (returns 401 on mismatch)
// @access  Public (during login)
router.post("/face/verify-at-login", async (req, res) => {
  try {
    const { userId, embedding } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Face embedding array is required.",
      });
    }

    if (embedding.length !== 512) {
      return res.status(400).json({
        success: false,
        message: "Face embedding must be 512 dimensions.",
      });
    }

    const bestMatch = await findBestMatch(embedding);

    if (!bestMatch) {
      return res.status(404).json({
        success: false,
        message: "No face enrollment found. Please enroll your face first.",
        enrolled: false,
      });
    }

    const match =
      bestMatch.match && parseInt(bestMatch.userId, 10) === userId;
    const similarity = 1 - bestMatch.distance;

    if (!match) {
      return res.status(401).json({
        success: false,
        verified: false,
        score: similarity,
        threshold: 1 - bestMatch.threshold,
        message: "Face mismatch – identity could not be verified.",
      });
    }

    // Success - face matches
    res.json({
      success: true,
      verified: true,
      score: similarity,
      threshold: 1 - bestMatch.threshold,
      message: "Face verified successfully.",
    });
  } catch (err) {
    secureLog("Face verification at login error", { operationStatus: "error" });
    res.status(500).json({
      success: false,
      error: "Server error during face verification.",
    });
  }
});


// ============================================
// CONSENT ROUTES
// ============================================

// @route   POST /api/biometrics/consent
// @desc    Record biometric consent
// @access  Public (during onboarding) or Private
router.post("/consent", async (req, res) => {
  try {
    const { userId, method, ip, userAgent } = req.body;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // Check if consent already exists
    const existingCheck = await pool.query(
      "SELECT id FROM biometric_consent WHERE user_id = $1",
      [targetUserId]
    );

    if (existingCheck.rowCount > 0) {
      // Update existing consent
      await pool.query(
        `UPDATE biometric_consent 
         SET method = $1, ip_address = $2, user_agent = $3, consented_at = CURRENT_TIMESTAMP, is_active = TRUE
         WHERE user_id = $4`,
        [
          method || "both",
          ip || req.ip,
          userAgent || req.get("user-agent"),
          targetUserId,
        ]
      );
    } else {
      // Create new consent
      await pool.query(
        `INSERT INTO biometric_consent (user_id, method, ip_address, user_agent, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [
          targetUserId,
          method || "both",
          ip || req.ip,
          userAgent || req.get("user-agent"),
        ]
      );
    }

    res.json({
      success: true,
      message: "Biometric consent recorded successfully.",
    });
  } catch (err) {
    secureLog("Consent recording error", { operationStatus: "error", userId: targetUserId });
    res.status(500).json({ error: "Server error recording consent." });
  }
});

// ============================================
// STATUS ROUTES
// ============================================

// @route   GET /api/biometrics/status
// @desc    Get user's biometric enrollment status
// @access  Public (during onboarding) or Private
router.get("/status", async (req, res) => {
  try {
    const { userId } = req.query;
    const authUser = req.user;

    const targetUserId = userId || (authUser ? authUser.id : null);
    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // Check WebAuthn enrollment
    const webauthnCheck = await pool.query(
      "SELECT id FROM webauthn_credentials WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
      [targetUserId]
    );

    // Check face enrollment
    const faceCheck = await pool.query(
      "SELECT id FROM biometric_face WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
      [targetUserId]
    );

    // Check consent
    const consentCheck = await pool.query(
      "SELECT id, method, consented_at FROM biometric_consent WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
      [targetUserId]
    );

    res.json({
      webauthn: webauthnCheck.rowCount > 0,
      face: faceCheck.rowCount > 0,
      consent: consentCheck.rowCount > 0,
      consentMethod:
        consentCheck.rowCount > 0 ? consentCheck.rows[0].method : null,
      consentedAt:
        consentCheck.rowCount > 0 ? consentCheck.rows[0].consented_at : null,
    });
  } catch (err) {
    secureLog("Biometric status error", { operationStatus: "error", userId: targetUserId });
    res.status(500).json({ error: "Server error checking biometric status." });
  }
});

module.exports = router;
