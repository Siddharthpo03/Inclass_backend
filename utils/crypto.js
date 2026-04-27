// @ts-check
// inclass-backend/utils/crypto.js
// AES-256 encryption and decryption for biometric embeddings
// SEC-004: Production-grade encryption key validation

const crypto = require("crypto");
const logger = require("./logger");

// ============================================
// CRITICAL SECURITY: Encryption Key Validation
// ============================================
// SEC-004: No fallback keys allowed - server MUST fail if key is missing
const ENCRYPTION_KEY = process.env.BIOMETRIC_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  const errorMessage = `
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
`;
  logger.error(errorMessage);
  throw new Error(
    "CRITICAL SECURITY ERROR: BIOMETRIC_ENCRYPTION_KEY is not set. Server cannot start.",
  );
}

// Validate key length: AES-256 requires 32 bytes = 64 hex characters
const MIN_KEY_LENGTH = 32; // Minimum 32 bytes (64 hex chars)
const keyLength = ENCRYPTION_KEY.length;

if (keyLength < MIN_KEY_LENGTH) {
  const errorMessage = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  CRITICAL SECURITY ERROR: BIOMETRIC_ENCRYPTION_KEY is too short             ║
║  Minimum length required: ${MIN_KEY_LENGTH} characters (${MIN_KEY_LENGTH * 2} hex chars for AES-256) ║
║  Current length: ${keyLength} characters                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

To fix:
1. Generate a secure ${MIN_KEY_LENGTH * 2}-character hex key:
   node -e "console.log(require('crypto').randomBytes(${MIN_KEY_LENGTH}).toString('hex'))"

2. Update BIOMETRIC_ENCRYPTION_KEY in your .env file

3. Restart the server
`;
  logger.error(errorMessage);
  throw new Error(
    `CRITICAL SECURITY ERROR: BIOMETRIC_ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH * 2} characters (${MIN_KEY_LENGTH} bytes) for AES-256. Current length: ${keyLength}.`,
  );
}

// Validate key format (should be hex string for consistency)
// Allow alphanumeric but warn if not hex
if (!/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
  logger.warn(
    "BIOMETRIC_ENCRYPTION_KEY contains non-hexadecimal characters. For best security, use a hex-encoded key (64 hex characters).",
  );
}

// Use the validated encryption key (no fallback)
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for salt
const TAG_LENGTH = 16; // 16 bytes for authentication tag

// Keys that must never be logged (biometric/crypto sensitive data)
const SENSITIVE_KEYS = new Set([
  "embedding",
  "encrypted_embedding",
  "faceDescriptor",
  "decryptedEmbedding",
  "key",
  "iv",
  "authTag",
  "tag",
  "salt",
  "encrypted",
  "decrypted",
  "publicKey",
  "response",
  "rawId",
  "clientDataJSON",
  "attestationObject",
  "authenticatorData",
  "signature",
]);

/**
 * Safe predicate: true if value looks like a face embedding (array of numbers, length 512).
 */
function looksLikeEmbedding(value) {
  if (!Array.isArray(value) || value.length !== 512) {
    return false;
  }
  return value.every((x) => typeof x === "number");
}

/**
 * Log a message with optional metadata. Never logs decrypted embeddings, keys, IVs,
 * auth tags, or other sensitive crypto/biometric data. Only metadata such as
 * embeddingLength, userId, and operationStatus is allowed.
 *
 * @param {string} message - Log message
 * @param {object} [data] - Optional data; only safe keys (e.g. embeddingLength, userId, operationStatus) are logged
 */
function secureLog(message, data) {
  if (data === undefined || data === null) {
    logger.error(message);
    return;
  }
  if (Array.isArray(data) && looksLikeEmbedding(data)) {
    logger.error(message + " (sensitive data omitted)");
    return;
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const safe = {};
    const allowed = new Set([
      "embeddingLength",
      "userId",
      "operationStatus",
      "code",
    ]);
    for (const [k, v] of Object.entries(data)) {
      if (SENSITIVE_KEYS.has(k)) {
        continue;
      }
      if (allowed.has(k)) {
        safe[k] = v;
      }
    }
    logger.error(message, Object.keys(safe).length ? safe : {});
    return;
  }
  logger.error(message);
}

/**
 * Derive a key from the encryption key using PBKDF2
 * @param {string} password - The encryption key
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted data as base64 string (format: salt:iv:tag:encrypted)
 */
function encrypt(text) {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from password and salt
    const key = deriveKey(ENCRYPTION_KEY, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Combine salt, iv, tag, and encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, "base64"),
    ]);

    // Return as base64 string
    return combined.toString("base64");
  } catch (error) {
    secureLog("Encryption failed.", { operationStatus: "error" });
    throw new Error("Failed to encrypt biometric data.");
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data as base64 string
 * @returns {string} Decrypted plain text
 */
function decrypt(encryptedData) {
  try {
    // Convert base64 string to buffer
    const combined = Buffer.from(encryptedData, "base64");

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Derive key from password and salt
    const key = deriveKey(ENCRYPTION_KEY, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    let decrypted = decipher.update(encrypted, null, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    secureLog("Decryption failed.", {
      operationStatus: "error",
      code: error.code,
    });

    // Check for common decryption errors without leaking error.message
    if (
      error.message.includes("Unsupported state") ||
      error.message.includes("bad decrypt")
    ) {
      throw new Error(
        "Failed to decrypt biometric data: Encryption key mismatch. " +
          "Ensure BIOMETRIC_ENCRYPTION_KEY in .env matches the key used during encryption.",
      );
    }

    throw new Error("Failed to decrypt biometric data.");
  }
}

module.exports = {
  encrypt,
  decrypt,
  secureLog,
};
