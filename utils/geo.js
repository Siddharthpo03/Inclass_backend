// inclass-backend/utils/geo.js (Simplified/Mocked)

const axios = require("axios");
require("dotenv").config();

async function getLocation(ip) {
  // 🚨 WARNING: Actual IP-to-Location is complex and requires third-party services.
  // We return a mock location for development purposes to keep the attendance flow working.

  if (ip === "::1" || ip === "127.0.0.1") {
    return "Localhost (Development IP)";
  }

  // Simulated service response
  return "University Main Campus, Building 3";
}

module.exports = getLocation;
