// inclass-backend/routes/attendance.js

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const auth = require("../middleware/auth");
const logger = require("../utils/logger");
const getLocation = require("../utils/geo"); // Utility to get location (needs fixing in geo.js)
const sendMail = require("../utils/mailer"); // Utility to send mail
const socketIO = require("../socket"); // Socket.io instance
const { findBestMatch } = require("../services/faceMatcher");

// Optional: Use biometric middleware instead of manual verification
// Example: router.post("/mark", auth(["student"]), biometricAuth({ requireAny: true }), async (req, res) => {
//   Then use req.biometricResults instead of manual verification
// });

// @route   POST /api/attendance/mark
// @desc    Student submits code to mark attendance (with face verification)
// @access  Private (Student only)
router.post("/mark", auth(["student"]), async (req, res) => {
  const { code, faceEmbedding } = req.body;
  const student_id = req.user.id;
  const ip = req.ip; // Get client IP address
  let location_text = "Unknown"; // Placeholder
  let faceVerified = false;
  let faceMatchScore = null;

  try {
    if (!code) {
      return res.status(400).json({ message: "Attendance code is required." });
    }

    // 1. Look up the session by code (only active sessions)
    // SECURE: Parameterized query prevents SQL injection
    const result = await pool.query(
      `SELECT id, expires_at, class_id FROM sessions 
             WHERE code = $1 AND is_active = TRUE 
             ORDER BY created_at DESC LIMIT 1`,
      [code],
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: "Invalid or inactive code." });
    }

    const session = result.rows[0];

    // 2. Check Expiration Time (Use Case 04: Allow reporting expired codes)
    if (new Date(session.expires_at) < new Date()) {
      // Code expired - return error but allow student to report it
      return res.status(400).json({
        message: "Code expired.",
        expired: true,
        session_id: session.id,
        expires_at: session.expires_at,
      });
    }

    // 2.5. Verify student is enrolled in the class
    const enrollmentCheck = await pool.query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND class_id = $2",
      [student_id, session.class_id],
    );
    if (enrollmentCheck.rowCount === 0) {
      return res.status(403).json({
        message: "You are not enrolled in this class.",
      });
    }

    // 2.6. ENFORCE FACE VERIFICATION - Check if FaceNet embedding is enrolled
    const faceCheck = await pool.query(
      "SELECT embedding FROM users WHERE id = $1 AND embedding IS NOT NULL",
      [student_id],
    );

    const faceEnrolled = faceCheck.rowCount > 0;

    if (!faceEnrolled) {
      return res.status(403).json({
        message:
          "Face enrollment required to mark attendance. Please enroll your face first.",
        faceEnrolled: false,
      });
    }

    // 3. Face Verification (REQUIRED)
    if (!faceEmbedding) {
      return res.status(400).json({
        message:
          "Face verification is required. Please provide face embedding.",
      });
    }

    try {
      // Get stored face embedding (from new biometric_face table)
      const faceEnrollment = await pool.query(
        "SELECT encrypted_embedding FROM biometric_face WHERE user_id = $1 AND is_active = TRUE",
        [student_id],
      );

      if (faceEnrollment.rowCount === 0) {
        return res.status(400).json({
          message: "Face enrollment not found. Please enroll your face first.",
        });
      }

      // Use pgvector nearest-neighbor search and ensure best match is the logged-in student
      if (!Array.isArray(faceEmbedding) || faceEmbedding.length !== 512) {
        return res.status(400).json({
          message: "Face embedding must be a 512-dim array.",
        });
      }

      const bestMatch = await findBestMatch(faceEmbedding);

      if (!bestMatch) {
        return res.status(400).json({
          message: "No face enrollments found for verification.",
        });
      }

      faceVerified =
        bestMatch.match && parseInt(bestMatch.userId, 10) === student_id;
      faceMatchScore = 1 - bestMatch.distance; // convert distance to similarity

      // ENFORCE: Face verification must pass
      if (!faceVerified) {
        return res.status(403).json({
          message:
            "Face verification failed. Captured face does not match logged-in student.",
          score: faceMatchScore,
        });
      }
    } catch (faceError) {
      logger.error("Face verification error: " + faceError.message);
      return res.status(500).json({ error: "Face verification error." });
    }

    // 4. Attempt to get geo-location (This requires a working geo.js)
    // location_text = await getLocation(ip); // Using mock IP for now, actual IP won't work in development

    // 5. Get student info for real-time notification
    const studentInfo = await pool.query(
      "SELECT id, name, roll_no FROM users WHERE id = $1",
      [student_id],
    );
    const student = studentInfo.rows[0];

    // 6. Record Attendance (with face verification data)
    const attendanceResult = await pool.query(
      `INSERT INTO attendance (student_id, session_id, ip_address, location, status, face_verified, face_match_score) 
             VALUES ($1, $2, $3, $4, 'Present', $5, $6)
             RETURNING id, created_at`,
      [student_id, session.id, ip, location_text, faceVerified, faceMatchScore],
    );
    const attendanceRecord = attendanceResult.rows[0];

    // 6. Emit real-time Socket.io event to faculty monitoring this session
    try {
      const io = socketIO.getIO();
      if (io) {
        // Emit to session-specific room with verification flags
        io.to(`session_${session.id}`).emit("attendance:marked", {
          attendanceId: attendanceRecord.id,
          studentId: student.id,
          studentName: student.name,
          studentRollNo: student.roll_no,
          sessionId: session.id,
          classId: session.class_id,
          timestamp: attendanceRecord.created_at,
          status: "Present",
          face_verified: faceVerified,
          face_match_score: faceMatchScore,
          is_overridden: false,
        });

        // Also emit to class room for broader monitoring
        io.to(`class_${session.class_id}`).emit("attendance:marked", {
          attendanceId: attendanceRecord.id,
          studentId: student.id,
          studentName: student.name,
          studentRollNo: student.roll_no,
          sessionId: session.id,
          classId: session.class_id,
          timestamp: attendanceRecord.created_at,
          status: "Present",
          face_verified: faceVerified,
          face_match_score: faceMatchScore,
          is_overridden: false,
        });

        logger.debug(
          `Emitted attendance event for student ${student.name} (${student.roll_no}) in session ${session.id}`,
        );
      }
    } catch (socketError) {
      // Don't fail the request if Socket.io fails
      logger.error("Socket.io emission error: " + socketError.message);
    }

    // 7. Optional: Notify faculty (using mock email)
    sendMail(
      "faculty@college.com",
      "Attendance Marked",
      `Student ${student.name} (${student.roll_no}) marked attendance for session ${session.id}.`,
    );

    res.json({
      message: "Attendance marked successfully.",
      attendanceId: attendanceRecord.id,
      timestamp: attendanceRecord.created_at,
      faceVerified: faceVerified,
      faceMatchScore: faceMatchScore,
    });
  } catch (err) {
    if (err.code === "23505") {
      // Unique constraint violation (Student already marked attendance for this session)
      return res.status(400).json({
        message: "You have already marked attendance for this session.",
      });
    }
    logger.error("Attendance marking error: " + err.message);
    res.status(500).json({ error: "Server error during attendance marking." });
  }
});

module.exports = router;
