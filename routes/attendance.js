// inclass-backend/routes/attendance.js

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const auth = require("../middleware/auth");
const logger = require("../utils/logger");
const sendMail = require("../utils/mailer"); // Utility to send mail
const socketIO = require("../socket"); // Socket.io instance
const { verifyFace: verifyFaceWithAi } = require("../services/aiFaceClient");

// Optional: Use biometric middleware instead of manual verification
// Example: router.post("/mark", auth(["student"]), biometricAuth({ requireAny: true }), async (req, res) => {
//   Then use req.biometricResults instead of manual verification
// });

// @route   POST /api/attendance/mark
// @desc    Student submits code to mark attendance (with face verification)
// @access  Private (Student only)
router.post("/mark", auth(["student"]), async (req, res) => {
  const { code, faceImage } = req.body;
  const student_id = req.user.id;
  const ip = req.ip; // Get client IP address
  let faceVerified = false;
  let faceMatchScore = null;

  try {
    if (!code) {
      return res.status(400).json({ message: "Attendance code is required." });
    }

    // 1. Look up the session by code (only active sessions)
    // SECURE: Parameterized query prevents SQL injection
    const result = await pool.query(
          `SELECT id, course_id, session_code, code_expires_at FROM sessions 
            WHERE session_code = $1 AND is_active = TRUE 
             ORDER BY created_at DESC LIMIT 1`,
      [code],
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: "Invalid or inactive code." });
    }

    const session = result.rows[0];

    // 2. Check Expiration Time (Use Case 04: Allow reporting expired codes)
    if (session.code_expires_at && new Date(session.code_expires_at) < new Date()) {
      // Code expired - return error but allow student to report it
      return res.status(400).json({
        message: "Code expired.",
        expired: true,
        session_id: session.id,
        expires_at: session.code_expires_at,
      });
    }

    // 2.5. Verify student is approved for the course
    const enrollmentCheck = await pool.query(
      "SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND status = 'approved'",
      [student_id, session.course_id],
    );
    if (enrollmentCheck.rowCount === 0) {
      return res.status(403).json({
        message: "You are not enrolled in this course.",
      });
    }

    // 2.6. ENFORCE FACE VERIFICATION - Check if the user has enrolled face data
    const faceCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND (face_enrolled = TRUE OR embedding IS NOT NULL)",
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
    if (!faceImage) {
      return res.status(400).json({
        message: "Face verification is required. Please provide a face image.",
      });
    }

    try {
      const verification = await verifyFaceWithAi({
        userId: student_id,
        image: faceImage,
      });

      faceVerified = Boolean(verification.verified);
      faceMatchScore = Number(verification.confidence || 0);

      if (!faceVerified) {
        return res.status(403).json({
          message:
            verification.instruction ||
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
          `INSERT INTO attendance (student_id, session_id, course_id, status, marked_by, face_verified, notes) 
            VALUES ($1, $2, $3, 'present', 'student', $4, $5)
             RETURNING id, marked_at`,
          [student_id, session.id, session.course_id, faceVerified, `Face score: ${faceMatchScore ?? 0}`],
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
          classId: session.course_id,
          courseId: session.course_id,
          timestamp: attendanceRecord.marked_at,
          status: "present",
          face_verified: faceVerified,
          face_match_score: faceMatchScore,
        });

        // Also emit to class room for broader monitoring
        io.to(`class_${session.course_id}`).emit("attendance:marked", {
          attendanceId: attendanceRecord.id,
          studentId: student.id,
          studentName: student.name,
          studentRollNo: student.roll_no,
          sessionId: session.id,
          classId: session.course_id,
          courseId: session.course_id,
          timestamp: attendanceRecord.marked_at,
          status: "present",
          face_verified: faceVerified,
          face_match_score: faceMatchScore,
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
      success: true,
      message: "Attendance marked successfully.",
      attendanceId: attendanceRecord.id,
      timestamp: attendanceRecord.marked_at,
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
