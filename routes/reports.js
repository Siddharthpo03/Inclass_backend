// Reports routes for expired codes and duplicate submissions
const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const sendMail = require("../utils/mailer");
const {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  validateRequired,
} = require("../utils/errorHandler");

// @route   POST /api/reports/expired-code
// @desc    Student reports expired code (Use Case 04)
// @access  Private (Student)
router.post(
  "/expired-code",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const { session_id, reason } = req.body;
    const student_id = req.user.id;

    validateRequired(["session_id", "reason"], req.body);

    // SECURE: Parameterized query prevents SQL injection
    const sessionCheck = await pool.query(
      `SELECT s.id, s.class_id, s.expires_at, c.faculty_id 
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1`,
      [session_id]
    );

    if (sessionCheck.rowCount === 0) {
      throw new NotFoundError("Session not found.");
    }

    const session = sessionCheck.rows[0];

    // Check if code is actually expired
    if (new Date(session.expires_at) >= new Date()) {
      throw new ValidationError("Code has not expired yet.");
    }

    // Check if student is enrolled in the class
    const enrollmentCheck = await pool.query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND class_id = $2",
      [student_id, session.class_id]
    );

    if (enrollmentCheck.rowCount === 0) {
      throw new AuthenticationError("You are not enrolled in this class.");
    }

    // Check if report already exists
    const existingReport = await pool.query(
      "SELECT id FROM expired_code_reports WHERE student_id = $1 AND session_id = $2",
      [student_id, session_id]
    );

    if (existingReport.rowCount > 0) {
      throw new ValidationError("You have already reported this expired code.");
    }

    // Create report
    const reportResult = await pool.query(
      `INSERT INTO expired_code_reports (student_id, session_id, report_reason)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [student_id, session_id, reason]
    );

    // Get student info
    const studentInfo = await pool.query(
      "SELECT name, roll_no FROM users WHERE id = $1",
      [student_id]
    );
    const student = studentInfo.rows[0];

    // Notify faculty via email
    const facultyInfo = await pool.query(
      "SELECT name, email FROM users WHERE id = $1",
      [session.faculty_id]
    );
    const faculty = facultyInfo.rows[0];

    sendMail(
      faculty.email,
      "Expired Code Report - InClass",
      `Student ${student.name} (${student.roll_no}) has reported an expired code for session ${session_id}.\n\nReason: ${reason}\n\nPlease review and approve/reject the report in your dashboard.`
    );

    res.status(201).json({
      success: true,
      message: "Report submitted successfully. Faculty will be notified.",
      reportId: reportResult.rows[0].id,
    });
  })
);

// @route   GET /api/reports/expired-codes
// @desc    Faculty gets all expired code reports for their sessions
// @access  Private (Faculty)
router.get(
  "/expired-codes",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const faculty_id = req.user.id;

    const reports = await pool.query(
      `SELECT 
        r.id, r.student_id, r.session_id, r.report_reason, r.status, 
        r.faculty_response, r.created_at, r.resolved_at,
        u.name as student_name, u.roll_no as student_roll_no,
        s.code as session_code, s.expires_at,
        c.course_code, c.title as course_title
       FROM expired_code_reports r
       INNER JOIN users u ON u.id = r.student_id
       INNER JOIN sessions s ON s.id = r.session_id
       INNER JOIN classes c ON c.id = s.class_id
       WHERE c.faculty_id = $1
       ORDER BY r.created_at DESC`,
      [faculty_id]
    );

    res.json({
      success: true,
      reports: reports.rows,
    });
  })
);

// @route   POST /api/reports/expired-code/:reportId/approve
// @desc    Faculty approves expired code report (Use Case 04)
// @access  Private (Faculty)
router.post(
  "/expired-code/:reportId/approve",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const faculty_id = req.user.id;
    const { response } = req.body;

    // Verify report exists and belongs to faculty's class
    const reportCheck = await pool.query(
      `SELECT r.*, c.faculty_id 
       FROM expired_code_reports r
       INNER JOIN sessions s ON s.id = r.session_id
       INNER JOIN classes c ON c.id = s.class_id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportCheck.rowCount === 0) {
      throw new NotFoundError("Report not found.");
    }

    const report = reportCheck.rows[0];

    if (parseInt(report.faculty_id) !== parseInt(faculty_id)) {
      throw new AuthenticationError("You don't have permission to approve this report.");
    }

    if (report.status !== "Pending") {
      throw new ValidationError("Report has already been processed.");
    }

    // Update report status
    await pool.query(
      `UPDATE expired_code_reports 
       SET status = 'Approved', 
           faculty_response = $1,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [response || "Approved by faculty", reportId]
    );

    // Manually mark attendance for the student
    await pool.query(
      `INSERT INTO attendance (student_id, session_id, status, is_overridden, override_reason)
       VALUES ($1, $2, 'Manual', TRUE, $3)
       ON CONFLICT (student_id, session_id) 
       DO UPDATE SET 
         status = 'Manual',
         is_overridden = TRUE,
         override_reason = $3`,
      [report.student_id, report.session_id, `Expired code report approved: ${response || "N/A"}`]
    );

    res.json({
      success: true,
      message: "Report approved and attendance marked manually.",
    });
  })
);

// @route   POST /api/reports/expired-code/:reportId/reject
// @desc    Faculty rejects expired code report (Use Case 04)
// @access  Private (Faculty)
router.post(
  "/expired-code/:reportId/reject",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const faculty_id = req.user.id;
    const { response } = req.body;

    // Verify report exists and belongs to faculty's class
    const reportCheck = await pool.query(
      `SELECT r.*, c.faculty_id 
       FROM expired_code_reports r
       INNER JOIN sessions s ON s.id = r.session_id
       INNER JOIN classes c ON c.id = s.class_id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportCheck.rowCount === 0) {
      throw new NotFoundError("Report not found.");
    }

    const report = reportCheck.rows[0];

    if (parseInt(report.faculty_id) !== parseInt(faculty_id)) {
      throw new AuthenticationError("You don't have permission to reject this report.");
    }

    if (report.status !== "Pending") {
      throw new ValidationError("Report has already been processed.");
    }

    // Update report status
    await pool.query(
      `UPDATE expired_code_reports 
       SET status = 'Rejected', 
           faculty_response = $1,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [response || "Rejected by faculty", reportId]
    );

    res.json({
      success: true,
      message: "Report rejected.",
    });
  })
);

// @route   POST /api/reports/duplicate-detection
// @desc    Faculty detects and handles duplicate submissions (Use Case 05)
// @access  Private (Faculty)
router.post(
  "/duplicate-detection",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const { session_id } = req.body;
    const faculty_id = req.user.id;

    validateRequired(["session_id"], req.body);

    // Verify session belongs to faculty
    const sessionCheck = await pool.query(
      `SELECT s.id, s.class_id, c.faculty_id
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND c.faculty_id = $2`,
      [session_id, faculty_id]
    );

    if (sessionCheck.rowCount === 0) {
      throw new NotFoundError("Session not found or you don't have permission.");
    }

    // Check for duplicates (same student, same session, multiple entries)
    const duplicates = await pool.query(
      `SELECT student_id, COUNT(*) as count
       FROM attendance
       WHERE session_id = $1
       GROUP BY student_id
       HAVING COUNT(*) > 1`,
      [session_id]
    );

    if (duplicates.rowCount > 0) {
      // Mark all attendance records for this session as duplicates
      await pool.query(
        `UPDATE attendance 
         SET is_duplicate = TRUE
         WHERE session_id = $1`,
        [session_id]
      );

      // Delete all attendance for this session
      await pool.query(
        `DELETE FROM attendance WHERE session_id = $1`,
        [session_id]
      );

      res.json({
        success: true,
        message: "Duplicates detected and removed. Please restart attendance session.",
        duplicatesFound: duplicates.rowCount,
      });
    } else {
      res.json({
        success: true,
        message: "No duplicates detected.",
        duplicatesFound: 0,
      });
    }
  })
);

module.exports = router;

