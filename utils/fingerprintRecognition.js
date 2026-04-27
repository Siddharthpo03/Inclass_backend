// inclass-backend/utils/fingerprintRecognition.js
// WebAuthn fingerprint recognition utility

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { isoBase64URL, isoUint8Array } = require("@simplewebauthn/server/helpers");

// WebAuthn configuration
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"; // Relying Party ID
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "InClass Attendance System";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:5173"; // Frontend origin

/**
 * Generate registration options for fingerprint enrollment
 * @param {number} userId - User ID
 * @param {string} userName - User's name/email
 * @param {Array} existingCredentials - Array of existing credential IDs for this user
 * @returns {Object} Registration options
 */
function generateFingerprintRegistrationOptions(userId, userName, existingCredentials = []) {
  const options = generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: isoUint8Array.fromUTF8String(userId.toString()),
    userName: userName,
    timeout: 60000, // 60 seconds
    attestationType: "none", // We don't need attestation for basic fingerprint
    excludeCredentials: existingCredentials.map((cred) => ({
      id: isoBase64URL.toBase64URL(cred.credential_id),
      type: "public-key",
      transports: ["internal"], // Fingerprint readers are typically internal
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform", // Platform authenticators (fingerprint readers)
      userVerification: "required", // Require user verification (fingerprint)
      requireResidentKey: false, // Don't require resident keys
    },
    supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
  });

  return options;
}

/**
 * Verify registration response and extract credential data
 * @param {Object} registrationResponse - Registration response from client
 * @param {Object} expectedChallenge - Expected challenge from registration options
 * @param {string} expectedOrigin - Expected origin
 * @param {string} expectedRPID - Expected Relying Party ID
 * @returns {Object} Verification result with credential data
 */
async function verifyFingerprintRegistration(
  registrationResponse,
  expectedChallenge,
  expectedOrigin = ORIGIN,
  expectedRPID = RP_ID
) {
  try {
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: expectedChallenge,
      expectedOrigin: expectedOrigin,
      expectedRPID: expectedRPID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

      return {
        verified: true,
        credentialID: isoBase64URL.fromBuffer(credentialID),
        publicKey: isoBase64URL.fromBuffer(credentialPublicKey),
        counter: counter,
      };
    }

    return {
      verified: false,
      error: "Registration verification failed",
    };
  } catch (error) {
    console.error("Fingerprint registration verification error:", error);
    return {
      verified: false,
      error: error.message || "Registration verification error",
    };
  }
}

/**
 * Generate authentication options for fingerprint verification
 * @param {Array} userCredentials - Array of user's credential IDs
 * @returns {Object} Authentication options
 */
function generateFingerprintAuthenticationOptions(userCredentials = []) {
  const options = generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: userCredentials.map((cred) => ({
      id: isoBase64URL.toBase64URL(cred.credential_id),
      type: "public-key",
      transports: ["internal"],
    })),
    userVerification: "required", // Require fingerprint verification
    timeout: 60000, // 60 seconds
  });

  return options;
}

/**
 * Verify authentication response
 * @param {Object} authenticationResponse - Authentication response from client
 * @param {Object} expectedChallenge - Expected challenge from authentication options
 * @param {Object} credential - Stored credential data from database
 * @param {number} expectedCounter - Expected signature counter
 * @param {string} expectedOrigin - Expected origin
 * @param {string} expectedRPID - Expected Relying Party ID
 * @returns {Object} Verification result
 */
async function verifyFingerprintAuthentication(
  authenticationResponse,
  expectedChallenge,
  credential,
  expectedCounter,
  expectedOrigin = ORIGIN,
  expectedRPID = RP_ID
) {
  try {
    const publicKey = isoBase64URL.toBuffer(credential.public_key);
    const credentialID = isoBase64URL.toBuffer(credential.credential_id);

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: expectedChallenge,
      expectedOrigin: expectedOrigin,
      expectedRPID: expectedRPID,
      credential: {
        id: credentialID,
        publicKey: publicKey,
        counter: expectedCounter,
      },
      requireUserVerification: true,
    });

    if (verification.verified) {
      return {
        verified: true,
        newCounter: verification.authenticationInfo.newCounter,
      };
    }

    return {
      verified: false,
      error: "Authentication verification failed",
    };
  } catch (error) {
    console.error("Fingerprint authentication verification error:", error);
    return {
      verified: false,
      error: error.message || "Authentication verification error",
    };
  }
}

/**
 * Check if WebAuthn is supported
 * @returns {boolean}
 */
function isWebAuthnSupported() {
  // WebAuthn is a browser API, so this is just a placeholder
  // The actual check happens on the frontend
  return true;
}

module.exports = {
  generateFingerprintRegistrationOptions,
  verifyFingerprintRegistration,
  generateFingerprintAuthenticationOptions,
  verifyFingerprintAuthentication,
  isWebAuthnSupported,
  RP_ID,
  RP_NAME,
  ORIGIN,
};

