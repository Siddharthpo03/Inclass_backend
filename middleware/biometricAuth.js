// inclass-backend/middleware/biometricAuth.js
// Biometric authentication middleware for attendance marking (face only)

const { pool } = require("../config/database");
const { findBestMatch } = require("../services/faceMatcher");

// Store authentication challenges (in production, use Redis)
const authenticationChallenges = new Map();

/**
 * Middleware to validate biometric authentication during attendance marking
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireFace - Require face verification (default: false)
 * @param {boolean} options.requireAny - Require at least one biometric (default: false)
 * @param {boolean} options.allowNone - Allow attendance without biometrics (default: true)
 * @returns {Function} Express middleware function
 */
function biometricAuth(options = {}) {
  const {
    requireFace = false,
    requireAny = false,
    allowNone = true,
  } = options;

  return async (req, res, next) => {
    const userId = req.user.id;
    const { faceEmbedding } = req.body;

    const biometricResults = {
      faceVerified: false,
      faceMatchScore: null,
      faceError: null,
    };

    // Face Verification using precomputed embedding from frontend
    if (faceEmbedding || requireFace) {
      try {
        if (!faceEmbedding && requireFace) {
          return res.status(400).json({
          message: "Face embedding is required for attendance marking.",
            code: "FACE_REQUIRED",
          });
        }
        if (!Array.isArray(faceEmbedding) || faceEmbedding.length !== 512) {
          return res.status(400).json({
            message: "Face embedding must be a 512-dim array.",
            code: "FACE_INVALID_EMBEDDING",
          });
        }

        const bestMatch = await findBestMatch(faceEmbedding);

        if (!bestMatch) {
          biometricResults.faceError = "No enrolled faces available for matching";
        } else {
          biometricResults.faceVerified =
            bestMatch.match && bestMatch.userId === userId;
          biometricResults.faceMatchScore = 1 - bestMatch.distance; // higher is better

          if (requireFace && !biometricResults.faceVerified) {
            return res.status(403).json({
              message:
                "Face verification failed. Captured face does not match logged-in user.",
              code: "FACE_VERIFICATION_FAILED",
              score: biometricResults.faceMatchScore,
            });
          }
        }
      } catch (faceError) {
        console.error("Face verification error in middleware:", faceError);
        if (requireFace) {
          return res.status(500).json({
            message: "Face verification error.",
            code: "FACE_VERIFICATION_ERROR",
          });
        }
        biometricResults.faceError = faceError.message;
      }
    }

    // Check if any biometric is required
    if (requireAny && !biometricResults.faceVerified) {
      return res.status(403).json({
        message: "Face verification is required.",
        code: "BIOMETRIC_REQUIRED",
      });
    }

    // Check if none are allowed
    if (!allowNone && !biometricResults.faceVerified) {
      return res.status(403).json({
        message: "Face verification is required for attendance marking.",
        code: "BIOMETRIC_REQUIRED",
      });
    }

    req.biometricResults = biometricResults;
    next();
  };
}

/**
 * Helper function to set authentication challenge (used by WebAuthn routes)
 */
function setAuthenticationChallenge(userId, challenge) {
  authenticationChallenges.set(userId.toString(), {
    challenge,
    timestamp: Date.now(),
  });
}

/**
 * Helper function to get authentication challenge
 */
function getAuthenticationChallenge(userId) {
  return authenticationChallenges.get(userId.toString());
}

/**
 * Helper function to clear authentication challenge
 */
function clearAuthenticationChallenge(userId) {
  authenticationChallenges.delete(userId.toString());
}

// Clean up old challenges every 5 minutes (skip in tests to avoid open handles)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of authenticationChallenges.entries()) {
      if (now - value.timestamp > 300000) {
        authenticationChallenges.delete(key);
      }
    }
  }, 300000);
}

module.exports = {
  biometricAuth,
  setAuthenticationChallenge,
  getAuthenticationChallenge,
  clearAuthenticationChallenge,
};
