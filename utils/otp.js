// inclass-backend/utils/otp.js
// OTP generation and hashing utilities

const crypto = require("crypto");
const bcrypt = require("bcrypt");

/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash an OTP using bcrypt
 * @param {string} otp - Plain text OTP
 * @returns {Promise<string>} Hashed OTP
 */
async function hashOtp(otp) {
  const saltRounds = 10;
  return await bcrypt.hash(otp, saltRounds);
}

/**
 * Verify an OTP against a hash
 * @param {string} otp - Plain text OTP to verify
 * @param {string} hash - Hashed OTP to compare against
 * @returns {Promise<boolean>} True if OTP matches
 */
async function verifyOtp(otp, hash) {
  return await bcrypt.compare(otp, hash);
}

/**
 * Get OTP expiration time (default: 5 minutes from now)
 * @param {number} minutes - Minutes until expiration (default: 5)
 * @returns {Date} Expiration timestamp
 */
function getOtpExpiration(minutes = 5) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  getOtpExpiration,
};

