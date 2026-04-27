// inclass-backend/routes/registrations.js
// Student course registration routes

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AuthenticationError,
} = require("../utils/errorHandler");

// @route   POST /api/registrations
// @desc    Student registers for a course
// @access  Private (student)
router.post(
  "/",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const studentId = req.user.id;
    const { courseId } = req.body;

    console.log("📝 Course registration request:", { studentId, courseId });

    if (!courseId) {
      throw new ValidationError("Course ID is required.");
    }

    // Check if course exists in either courses or classes table
    // SECURE: Parameterized query prevents SQL injection
    let courseResult = await pool.query(
      `SELECT id, faculty_id, course_code, course_name 
       FROM courses 
       WHERE id = $1 AND (is_active = TRUE OR is_active IS NULL)`,
      [courseId]
    );

    // If not found, check classes table (legacy system)
    if (courseResult.rowCount === 0) {
      courseResult = await pool.query(
        `SELECT id, faculty_id, course_code, title as course_name 
         FROM classes 
         WHERE id = $1`,
        [courseId]
      );
    }

    if (courseResult.rowCount === 0) {
      throw new NotFoundError("Course not found or inactive.");
    }

    const course = courseResult.rows[0];

    // Check if already registered
    const existingCheck = await pool.query(
      `SELECT id, status FROM student_registrations 
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );

    if (existingCheck.rowCount > 0) {
      const existing = existingCheck.rows[0];
      if (existing.status === "approved") {
        throw new ValidationError("You are already registered for this course.");
      } else if (existing.status === "pending") {
        throw new ValidationError("Registration request is already pending approval.");
      }
    }

    // Create registration request
    console.log("✅ Creating registration:", { studentId, courseId, facultyId: course.faculty_id });
    
    try {
      const result = await pool.query(
        `INSERT INTO student_registrations (student_id, course_id, faculty_id, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, student_id, course_id, faculty_id, status, requested_at`,
        [studentId, courseId, course.faculty_id]
      );

      console.log("✅ Registration created successfully:", result.rows[0]);

      // Emit socket event
      const io = req.app.get("io");
      if (io) {
        io.to(`faculty:${course.faculty_id}`).emit("registration:created", {
          registrationId: result.rows[0].id,
          studentId: studentId,
          studentName: req.user.name || "Student",
          courseId: courseId,
          courseName: course.course_name || course.courseCode,
          requestedAt: result.rows[0].requested_at,
        });
      }
      
      res.status(201).json({
        success: true,
        message: "Course registration request submitted successfully.",
        registration: result.rows[0],
      });
    } catch (dbError) {
      console.error("❌ Database error during registration:", dbError);
      
      // Check for specific database errors
      if (dbError.code === '42P01') {
        // Table does not exist
        throw new Error("Database table 'student_registrations' does not exist. Please run database migrations.");
      } else if (dbError.code === '23503') {
        // Foreign key violation
        throw new Error(`Foreign key constraint violation: ${dbError.detail || dbError.message}`);
      } else if (dbError.code === '23505') {
        // Unique constraint violation
        throw new ValidationError("You have already submitted a registration request for this course.");
      } else {
        throw new Error(`Database error: ${dbError.message}`);
      }
    }
  })
);

// @route   GET /api/registrations/my-registrations
// @desc    Get student's course registrations
// @access  Private (student)
router.get(
  "/my-registrations",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const studentId = req.user.id;

    const result = await pool.query(
      `SELECT 
        sr.id,
        sr.status,
        sr.rejection_reason,
        sr.requested_at,
        sr.reviewed_at,
        c.id as course_id,
        c.course_code,
        c.course_name,
        c.description,
        c.credits,
        c.semester,
        c.academic_year,
        u.id as faculty_id,
        u.name as faculty_name,
        u.email as faculty_email
       FROM student_registrations sr
       JOIN courses c ON sr.course_id = c.id
       JOIN users u ON sr.faculty_id = u.id
       WHERE sr.student_id = $1
       ORDER BY sr.requested_at DESC`,
      [studentId]
    );

    res.json({
      registrations: result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        rejectionReason: row.rejection_reason,
        requestedAt: row.requested_at,
        reviewedAt: row.reviewed_at,
        course: {
          id: row.course_id,
          courseCode: row.course_code,
          courseName: row.course_name,
          description: row.description,
          credits: row.credits,
          semester: row.semester,
          academicYear: row.academic_year,
        },
        faculty: {
          id: row.faculty_id,
          name: row.faculty_name,
          email: row.faculty_email,
        },
      })),
    });
  })
);

// @route   GET /api/registrations/pending
// @desc    Get all pending course registrations for faculty
// @access  Private (faculty)
router.get(
  "/pending",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const facultyId = req.user.id;

    console.log("📋 Fetching pending registrations for faculty:", facultyId);

    // First, check all registrations for this faculty (for debugging)
    const allRegs = await pool.query(
      `SELECT id, status, faculty_id, course_id FROM student_registrations WHERE faculty_id = $1`,
      [facultyId]
    );
    console.log(`📋 Total registrations for faculty ${facultyId}:`, allRegs.rows.length);
    console.log("📋 Registration statuses:", allRegs.rows.map(r => ({ id: r.id, status: r.status })));

    const result = await pool.query(
      `SELECT 
        sr.id,
        sr.status,
        sr.rejection_reason,
        sr.requested_at,
        sr.reviewed_at,
        sr.course_id,
        u.id as student_id,
        u.name as student_name,
        u.email as student_email,
        u.roll_no as student_roll_no,
        COALESCE(c.course_code, cls.course_code) as course_code,
        COALESCE(c.course_name, cls.title) as course_name
       FROM student_registrations sr
       LEFT JOIN courses c ON sr.course_id = c.id
       LEFT JOIN classes cls ON sr.course_id = cls.id
       JOIN users u ON sr.student_id = u.id
       WHERE sr.faculty_id = $1 AND LOWER(sr.status) = 'pending'
       ORDER BY sr.requested_at DESC`,
      [facultyId]
    );

    console.log(`📋 Found ${result.rows.length} pending registrations for faculty ${facultyId}`);

    res.json({
      success: true,
      registrations: result.rows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        studentRollNo: row.student_roll_no,
        courseId: row.course_id,
        courseCode: row.course_code,
        courseName: row.course_name,
        status: row.status,
        requestedAt: row.requested_at,
      })),
      count: result.rows.length,
    });
  })
);

// @route   GET /api/faculty/courses/:courseId/registrations
// @desc    Get pending registrations for a course (faculty only)
// @access  Private (faculty)
router.get(
  "/faculty/courses/:courseId/registrations",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const facultyId = req.user.id;
    const { courseId } = req.params;

    // Verify course belongs to faculty
    const courseCheck = await pool.query(
      "SELECT id FROM courses WHERE id = $1 AND faculty_id = $2",
      [courseId, facultyId]
    );

    if (courseCheck.rowCount === 0) {
      throw new NotFoundError("Course not found or you don't have access to it.");
    }

    const result = await pool.query(
      `SELECT 
        sr.id,
        sr.status,
        sr.rejection_reason,
        sr.requested_at,
        sr.reviewed_at,
        u.id as student_id,
        u.name as student_name,
        u.email as student_email,
        u.roll_no as student_roll_no,
        u.college,
        u.department
       FROM student_registrations sr
       JOIN users u ON sr.student_id = u.id
       WHERE sr.course_id = $1
       ORDER BY sr.requested_at DESC`,
      [courseId]
    );

    res.json({
      registrations: result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        rejectionReason: row.rejection_reason,
        requestedAt: row.requested_at,
        reviewedAt: row.reviewed_at,
        student: {
          id: row.student_id,
          name: row.student_name,
          email: row.student_email,
          rollNo: row.student_roll_no,
          college: row.college,
          department: row.department,
        },
      })),
    });
  })
);

// @route   POST /api/faculty/registrations/:registrationId/approve
// @desc    Approve a student registration request (faculty only)
// @access  Private (faculty)
router.post(
  "/faculty/registrations/:registrationId/approve",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const facultyId = req.user.id;
    const { registrationId } = req.params;
    // Get registration and verify it belongs to faculty's course
    const regResult = await pool.query(
      `SELECT sr.id, sr.student_id, sr.course_id, sr.status, c.faculty_id
       FROM student_registrations sr
       JOIN courses c ON sr.course_id = c.id
       WHERE sr.id = $1`,
      [registrationId]
    );

    if (regResult.rowCount === 0) {
      throw new NotFoundError("Registration request not found.");
    }

    const registration = regResult.rows[0];

    if (registration.faculty_id !== facultyId) {
      throw new AuthenticationError("You don't have permission to approve this registration.");
    }

    if (registration.status !== "pending") {
      throw new ValidationError(`Registration is already ${registration.status}.`);
    }

    // Approve registration
    await pool.query(
      `UPDATE student_registrations 
       SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [registrationId]
    );

    res.json({
      success: true,
      message: "Registration approved successfully.",
    });
  })
);

// @route   POST /api/faculty/registrations/:registrationId/reject
// @desc    Reject a student registration request (faculty only)
// @access  Private (faculty)
router.post(
  "/faculty/registrations/:registrationId/reject",
  auth(["faculty"]),
  asyncHandler(async (req, res) => {
    const facultyId = req.user.id;
    const { registrationId } = req.params;
    const { rejectionReason } = req.body;

    // Get registration and verify it belongs to faculty's course
    const regResult = await pool.query(
      `SELECT sr.id, sr.status, c.faculty_id
       FROM student_registrations sr
       JOIN courses c ON sr.course_id = c.id
       WHERE sr.id = $1`,
      [registrationId]
    );

    if (regResult.rowCount === 0) {
      throw new NotFoundError("Registration request not found.");
    }

    const registration = regResult.rows[0];

    if (registration.faculty_id !== facultyId) {
      throw new AuthenticationError("You don't have permission to reject this registration.");
    }

    if (registration.status !== "pending") {
      throw new ValidationError(`Registration is already ${registration.status}.`);
    }

    // Reject registration
    await pool.query(
      `UPDATE student_registrations 
       SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [rejectionReason || "No reason provided", registrationId]
    );

    res.json({
      success: true,
      message: "Registration rejected successfully.",
    });
  })
);

module.exports = router;

