// inclass-backend/utils/sms.js
// Twilio SMS service using Twilio Verify API

const twilio = require("twilio");
require("dotenv").config();
const logger = require("./logger");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

// Initialize Twilio client
let twilioClient = null;

// Initialize Twilio and log status to terminal
(function initializeTwilio() {
  if (ACCOUNT_SID && AUTH_TOKEN) {
    try {
      twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);
      logger.info("Twilio initialized successfully");
      logger.debug("Account SID: " + ACCOUNT_SID);
      if (VERIFY_SERVICE_SID) {
        logger.debug("Verify Service SID: " + VERIFY_SERVICE_SID);
      } else {
        logger.warn(
          "TWILIO_VERIFY_SERVICE_SID not set. OTP sending will fail.",
        );
      }
    } catch (error) {
      logger.error("Failed to initialize Twilio: " + error.message);
      twilioClient = null;
    }
  } else {
    logger.warn(
      "Twilio credentials not set. SMS functionality will be disabled. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID in .env file",
    );
  }
})();

/**
 * Send OTP via SMS using Twilio Verify API
 * @param {string} phone - Phone number (with country code, e.g., +919154750857)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendOtpSms(phone) {
  if (!twilioClient) {
    return {
      success: false,
      error:
        "Twilio client not initialized. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env",
    };
  }

  if (!VERIFY_SERVICE_SID) {
    return {
      success: false,
      error: "TWILIO_VERIFY_SERVICE_SID not configured. Please set it in .env",
    };
  }

  if (!phone) {
    return {
      success: false,
      error: "Phone number is required",
    };
  }

  // Clean phone number - remove spaces, dashes, parentheses
  let cleanPhone = phone
    .toString()
    .trim()
    .replace(/[\s\-\(\)]/g, "");

  // Ensure phone number starts with + (E.164 format)
  if (!cleanPhone.startsWith("+")) {
    // If it starts with country code without +, add +
    if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
      cleanPhone = "+" + cleanPhone;
    } else if (cleanPhone.length === 10) {
      // Assume Indian number, add +91
      cleanPhone = "+91" + cleanPhone;
    } else {
      return {
        success: false,
        error:
          "Invalid phone number format. Please provide a valid phone number with country code (e.g., +919154750857).",
      };
    }
  }

  // Validate E.164 format (starts with +, followed by 1-15 digits)
  if (!/^\+[1-9]\d{1,14}$/.test(cleanPhone)) {
    return {
      success: false,
      error:
        "Invalid phone number format. Please provide a valid phone number in E.164 format (e.g., +919154750857).",
    };
  }

  try {
    logger.info(`Sending OTP to: ${cleanPhone}`);

    // Use Twilio Verify API to send OTP
    const verification = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({
        to: cleanPhone,
        channel: "sms",
      });

    logger.info(`Twilio OTP sent successfully to ${cleanPhone}`);
    logger.debug(`Verification SID: ${verification.sid}`);

    return {
      success: true,
      sid: verification.sid,
      response: verification,
    };
  } catch (error) {
    logger.error("Twilio Verify API error: " + (error.message || error));

    let errorMessage = "Failed to send OTP. Please try again.";
    if (error.message) {
      errorMessage = error.message;
    } else if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify OTP using Twilio Verify API
 * @param {string} phone - Phone number (with country code)
 * @param {string} otp - OTP code to verify
 * @returns {Promise<{success: boolean, verified: boolean, error?: string}>}
 */
async function verifyOtpSms(phone, otp) {
  if (!twilioClient) {
    return {
      success: false,
      verified: false,
      error: "Twilio client not initialized.",
    };
  }

  if (!VERIFY_SERVICE_SID) {
    return {
      success: false,
      verified: false,
      error: "TWILIO_VERIFY_SERVICE_SID not configured.",
    };
  }

  if (!phone || !otp) {
    return {
      success: false,
      verified: false,
      error: "Phone number and OTP are required",
    };
  }

  // Clean phone number (same as sendOtpSms)
  let cleanPhone = phone
    .toString()
    .trim()
    .replace(/[\s\-\(\)]/g, "");
  if (!cleanPhone.startsWith("+")) {
    if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
      cleanPhone = "+" + cleanPhone;
    } else if (cleanPhone.length === 10) {
      cleanPhone = "+91" + cleanPhone;
    }
  }

  try {
    console.log(`[Twilio Verify] Verifying OTP for: ${cleanPhone}`);

    const verificationCheck = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: cleanPhone,
        code: otp,
      });

    const verified = verificationCheck.status === "approved";

    if (verified) {
      console.log(`✅ Twilio OTP verified successfully for ${cleanPhone}`);
    } else {
      console.log(`❌ Twilio OTP verification failed for ${cleanPhone}`);
    }

    return {
      success: true,
      verified: verified,
      status: verificationCheck.status,
    };
  } catch (error) {
    console.error("❌ Twilio verification error:", error.message || error);

    return {
      success: false,
      verified: false,
      error: error.message || "Failed to verify OTP. Please try again.",
    };
  }
}

module.exports = {
  sendOtpSms,
  verifyOtpSms,
};
