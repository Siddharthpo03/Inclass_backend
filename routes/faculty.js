const express = require("express");
const router = express.Router();
const pool = require("../db"); // PostgreSQL connection pool
const auth = require("../middleware/auth"); // JWT middleware
const crypto = require("crypto");
const socketIO = require("../socket"); // Socket.io instance

// ------------------------
// Get logged-in faculty info
// ------------------------
router.get("/me", auth(["faculty"]), async (req, res) => {
  try {
    const facultyId = req.user.id;
    // SECURE: Parameterized query prevents SQL injection
    const result = await pool.query(
      "SELECT id, name, email, role, roll_no FROM users WHERE id = $1 AND role = 'faculty'",
      [facultyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Faculty not found" });
    }
    const user = result.rows[0];
    // Map to match frontend expectations (department and college are derived from roll_no or set defaults)
    res.json({
      name: user.name,
      email: user.email,
      role: user.role,
      id: user.roll_no, // Frontend expects roll_no as id
      department: user.roll_no ? user.roll_no.substring(0, 3) : "N/A",
      college: "Tech University", // Default or can be added to users table later
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error fetching faculty info" });
  }
});

// ------------------------
// Create a new course (new courses table)
// ------------------------
router.post("/courses", auth(["faculty"]), async (req, res) => {
  const { courseCode, courseName, description, credits, semester, academicYear, departmentId, collegeId } = req.body;
  const faculty_id = req.user.id;

  try {
    if (!courseCode || !courseName) {
      return res.status(400).json({ message: "Course code and name are required." });
    }

    const result = await pool.query(
      `INSERT INTO courses (faculty_id, course_code, course_name, description, credits, semester, academic_year, department_id, college_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, course_code, course_name, description, credits, semester, academic_year`,
      [faculty_id, courseCode, courseName, description || null, credits || null, semester || null, academicYear || null, departmentId || null, collegeId || null]
    );

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      course: result.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "You have already created a course with this code." });
    }
    console.error(err);
    res.status(500).json({ error: "Server error while creating course" });
  }
});

// ------------------------
// Register a new course (legacy - for backward compatibility)
// ------------------------
router.post("/register-course", auth(["faculty"]), async (req, res) => {
  const { course_code, title, total_classes } = req.body;
  const faculty_id = req.user.id;

  try {
    if (!course_code || !title || !total_classes || total_classes < 1) {
      return res
        .status(400)
        .json({ message: "Missing required fields or invalid class count." });
    }

    const result = await pool.query(
      `INSERT INTO classes (faculty_id, course_code, title, total_classes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, course_code, title`,
      [faculty_id, course_code, title, total_classes]
    );

    res.status(201).json({
      message: "Course registered successfully",
      course: result.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ message: "You have already registered this course code." });
    }
    console.error(err);
    res.status(500).json({ error: "Server error while registering course" });
  }
});

// ------------------------
// List all courses by faculty (new courses table)
// ------------------------
router.get("/:facultyId/courses", auth(["faculty", "student"]), async (req, res) => {
  const { facultyId } = req.params;
  const requestingUserId = req.user.id;
  const requestingUserRole = req.user.role;

  console.log(`📚 Courses request for faculty ${facultyId} by ${requestingUserRole} ${requestingUserId}`);

  try {
    // Verify faculty exists and requesting user has permission
    if (requestingUserRole === "faculty" && parseInt(facultyId) !== requestingUserId) {
      return res.status(403).json({ message: "You can only view your own courses." });
    }

    // Convert facultyId to integer
    const facultyIdInt = parseInt(facultyId);
    if (isNaN(facultyIdInt)) {
      return res.status(400).json({ message: "Invalid faculty ID" });
    }

    // Query both tables: classes (legacy) and courses (new)
    // First try the classes table (what faculty dashboard uses)
    const classesResult = await pool.query(
      `SELECT id, course_code, title, total_classes, created_at
       FROM classes 
       WHERE faculty_id = $1
       ORDER BY created_at DESC`,
      [facultyIdInt]
    );

    // Also try the courses table (new system)
    const coursesResult = await pool.query(
      `SELECT id, course_code, course_name, description, credits, semester, academic_year, department_id, college_id, is_active, created_at
       FROM courses 
       WHERE faculty_id = $1 AND (is_active = TRUE OR is_active IS NULL)
       ORDER BY created_at DESC`,
      [facultyIdInt]
    );

    console.log(`✅ Found ${classesResult.rowCount} courses from classes table and ${coursesResult.rowCount} from courses table for faculty ${facultyId}`);

    // Combine results from both tables
    const allCourses = [
      // Map classes table results
      ...classesResult.rows.map((row) => ({
        id: row.id,
        courseCode: row.course_code,
        courseName: row.title, // classes table uses 'title' instead of 'course_name'
        description: null,
        credits: null,
        semester: null,
        academicYear: null,
        departmentId: null,
        collegeId: null,
        isActive: true,
        createdAt: row.created_at,
        totalClasses: row.total_classes,
      })),
      // Map courses table results
      ...coursesResult.rows.map((row) => ({
        id: row.id,
        courseCode: row.course_code,
        courseName: row.course_name,
        description: row.description,
        credits: row.credits,
        semester: row.semester,
        academicYear: row.academic_year,
        departmentId: row.department_id,
        collegeId: row.college_id,
        isActive: row.is_active,
        createdAt: row.created_at,
      })),
    ];

    // Remove duplicates based on course_code (in case same course exists in both tables)
    const uniqueCourses = allCourses.reduce((acc, course) => {
      const existing = acc.find((c) => c.courseCode === course.courseCode);
      if (!existing) {
        acc.push(course);
      }
      return acc;
    }, []);

    res.json({
      courses: uniqueCourses,
    });
  } catch (err) {
    console.error("❌ Error fetching courses:", err);
    res.status(500).json({ error: "Server error while fetching courses" });
  }
});

// ------------------------
// List all courses by faculty (legacy - for backward compatibility)
// ------------------------
router.get("/my-courses", auth(["faculty"]), async (req, res) => {
  const faculty_id = req.user.id;
  try {
    const result = await pool.query(
      `SELECT c.id, c.course_code, c.title, c.total_classes,
              COUNT(DISTINCT e.student_id) as student_count,
              EXISTS(
                SELECT 1 FROM sessions s 
                WHERE s.class_id = c.id 
                AND s.is_active = TRUE 
                AND s.expires_at > NOW()
              ) as has_active_session
       FROM classes c
       LEFT JOIN enrollments e ON e.class_id = c.id
       WHERE c.faculty_id = $1
       GROUP BY c.id, c.course_code, c.title, c.total_classes
       ORDER BY c.title`,
      [faculty_id]
    );
    
    res.json(result.rows.map(row => ({
      id: row.id,
      course_code: row.course_code,
      title: row.title,
      total_classes: row.total_classes,
      student_count: parseInt(row.student_count) || 0,
      has_active_session: row.has_active_session || false,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while fetching courses" });
  }
});

// ------------------------
// Get single course by ID
// ------------------------
router.get("/courses/:courseId", auth(["faculty"]), async (req, res) => {
  const { courseId } = req.params;
  const faculty_id = req.user.id;
  
  try {
    const result = await pool.query(
      `SELECT id, course_code, title, total_classes, created_at 
       FROM classes 
       WHERE id = $1 AND faculty_id = $2`,
      [courseId, faculty_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Course not found or access denied" });
    }
    
    const course = result.rows[0];
    
    // Get student count
    const studentCountResult = await pool.query(
      "SELECT COUNT(*) as count FROM enrollments WHERE class_id = $1",
      [courseId]
    );
    
    res.json({
      id: course.id,
      course_code: course.course_code,
      title: course.title,
      total_classes: course.total_classes,
      student_count: parseInt(studentCountResult.rows[0].count) || 0,
      created_at: course.created_at,
    });
  } catch (err) {
    console.error("Error fetching course:", err);
    res.status(500).json({ error: "Server error while fetching course" });
  }
});

// ------------------------
// List faculty by college and department
// ------------------------
router.get("/list", auth(["student"]), async (req, res) => {
  const { collegeId, departmentId } = req.query;

  console.log("📋 Faculty list request:", { collegeId, departmentId, userId: req.user.id });

  try {
    let query = `
      SELECT u.id, u.name, u.email, u.roll_no, 
             d.name as department_name, c.name as college_name,
             u.college_id, u.department_id
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.role = 'faculty'
    `;
    const params = [];
    
    if (collegeId) {
      // Convert to integer to match database type
      const collegeIdInt = parseInt(collegeId);
      if (!isNaN(collegeIdInt)) {
        params.push(collegeIdInt);
        query += ` AND u.college_id = $${params.length}`;
      }
    }
    
    if (departmentId) {
      // Convert to integer to match database type
      const departmentIdInt = parseInt(departmentId);
      if (!isNaN(departmentIdInt)) {
        params.push(departmentIdInt);
        query += ` AND u.department_id = $${params.length}`;
      }
    }
    
    query += " ORDER BY u.name";

    // SECURE: Parameterized query (params array) prevents SQL injection
    console.log("🔍 Executing query:", query);
    console.log("📊 Query parameters:", params);

    const result = await pool.query(query, params);

    console.log(`✅ Found ${result.rowCount} faculty members`);

    res.json({
      faculty: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        rollNo: row.roll_no,
        departmentName: row.department_name,
        collegeName: row.college_name,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while fetching faculty" });
  }
});

// ------------------------
// Generate attendance session
// ------------------------
router.post("/start-session", auth(["faculty"]), async (req, res) => {
  const { class_id } = req.body;
  const faculty_id = req.user.id;
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
  const expires_at = new Date(Date.now() + EXPIRATION_MS);

  try {
    if (!class_id) {
      return res.status(400).json({ message: "Class ID required" });
    }

    // Verify the class belongs to this faculty
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND faculty_id = $2",
      [class_id, faculty_id]
    );
    
    if (classCheck.rowCount === 0) {
      return res.status(403).json({ message: "You don't have permission to start a session for this class." });
    }

    const result = await pool.query(
      `INSERT INTO sessions (class_id, code, expires_at, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id, code, expires_at, is_active`,
      [class_id, code, expires_at]
    );

    const newSession = result.rows[0];

    // Emit real-time Socket.io event when session is started
    try {
      const io = socketIO.getIO();
      if (io) {
        // Emit to class room to notify all connected clients
        io.to(`class_${class_id}`).emit("sessionStarted", {
          sessionId: newSession.id,
          code: newSession.code,
          classId: class_id,
          expiresAt: newSession.expires_at,
          facultyId: faculty_id,
        });

        console.log(`📡 Emitted session started event for class ${class_id} with code ${newSession.code}`);
      }
    } catch (socketError) {
      // Don't fail the request if Socket.io fails
      console.error("Socket.io emission error:", socketError);
    }

    res.json({
      message: "Session started",
      session: {
        id: newSession.id,
        code: newSession.code,
        expires_at: newSession.expires_at,
        is_active: newSession.is_active !== false, // Ensure it's true
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while starting session" });
  }
});

// ------------------------
// Get all sessions for faculty
// ------------------------
router.get("/sessions", auth(["faculty"]), async (req, res) => {
  const faculty_id = req.user.id;
  
  try {
    console.log(`📋 Fetching sessions for faculty ID: ${faculty_id}`);
    
    const result = await pool.query(
      `SELECT s.id, s.class_id, s.code, s.expires_at, s.is_active, s.created_at,
              c.title, c.course_code
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE c.faculty_id = $1
       ORDER BY s.created_at DESC`,
      [faculty_id]
    );
    
    console.log(`📋 Found ${result.rows.length} sessions in database`);
    
    const sessions = result.rows.map(row => {
      const isExpired = new Date(row.expires_at) <= new Date();
      const isActive = row.is_active && !isExpired;
      
      return {
        id: row.id,
        class_id: row.class_id,
        course_id: row.class_id, // For compatibility
        code: row.code,
        expires_at: row.expires_at,
        is_active: isActive,
        created_at: row.created_at,
        createdAt: row.created_at,
        course_title: row.title,
        course_code: row.course_code,
      };
    });
    
    console.log(`📋 Returning ${sessions.length} sessions, ${sessions.filter(s => s.is_active).length} active`);
    
    // Update expired sessions in database
    const updateResult = await pool.query(
      `UPDATE sessions 
       SET is_active = FALSE 
       WHERE expires_at < NOW() AND is_active = TRUE 
       AND class_id IN (SELECT id FROM classes WHERE faculty_id = $1)`,
      [faculty_id]
    );
    
    if (updateResult.rowCount > 0) {
      console.log(`📋 Updated ${updateResult.rowCount} expired sessions`);
    }
    
    res.json(sessions);
  } catch (err) {
    console.error("❌ Error fetching sessions:", err);
    res.status(500).json({ error: "Server error while fetching sessions" });
  }
});

// ------------------------
// Get single session by ID
// ------------------------
router.get("/sessions/:sessionId", auth(["faculty"]), async (req, res) => {
  const { sessionId } = req.params;
  const faculty_id = req.user.id;
  
  try {
    const result = await pool.query(
      `SELECT s.id, s.class_id, s.code, s.expires_at, s.is_active, s.created_at,
              c.title, c.course_code, c.faculty_id
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND c.faculty_id = $2`,
      [sessionId, faculty_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Session not found or access denied" });
    }
    
    const session = result.rows[0];
    const isActive = session.is_active && new Date(session.expires_at) > new Date();
    
    res.json({
      id: session.id,
      class_id: session.class_id,
      code: session.code,
      expires_at: session.expires_at,
      is_active: isActive,
      created_at: session.created_at,
      course_title: session.title,
      course_code: session.course_code,
    });
  } catch (err) {
    console.error("Error fetching session:", err);
    res.status(500).json({ error: "Server error while fetching session" });
  }
});

// ------------------------
// End a session
// ------------------------
router.post("/sessions/:sessionId/end", auth(["faculty"]), async (req, res) => {
  const { sessionId } = req.params;
  const faculty_id = req.user.id;
  
  try {
    // Verify session belongs to faculty
    const sessionCheck = await pool.query(
      `SELECT s.id, s.class_id, c.faculty_id
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND c.faculty_id = $2`,
      [sessionId, faculty_id]
    );
    
    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ message: "Session not found or access denied" });
    }
    
    // Mark session as inactive
    await pool.query(
      "UPDATE sessions SET is_active = FALSE WHERE id = $1",
      [sessionId]
    );
    
    res.json({ message: "Session ended successfully" });
  } catch (err) {
    console.error("Error ending session:", err);
    res.status(500).json({ error: "Server error while ending session" });
  }
});

// ------------------------
// Get course roster (students)
// ------------------------
router.get("/course-roster/:classId", auth(["faculty"]), async (req, res) => {
  const { classId } = req.params;
  const faculty_id = req.user.id;

  try {
    // Verify the class belongs to this faculty
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND faculty_id = $2",
      [classId, faculty_id]
    );
    
    if (classCheck.rowCount === 0) {
      return res.status(404).json({ message: "Course not found or access denied" });
    }

    // Fixed: Use users and enrollments tables (enrollments table now exists in schema)
    const result = await pool.query(
      `SELECT u.id, u.name, u.roll_no, u.email,
              CASE WHEN e.student_id IS NOT NULL THEN TRUE ELSE FALSE END as enrolled
       FROM users u
       LEFT JOIN enrollments e ON e.student_id = u.id AND e.class_id = $1
       WHERE u.role = 'student' AND e.class_id = $1
       ORDER BY u.name`,
      [classId]
    );

    res.json({
      roster: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        roll_no: row.roll_no,
        rollNo: row.roll_no,
        email: row.email,
        enrolled: row.enrolled !== false, // Default to true if not specified
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch course roster" });
  }
});

// ------------------------
// Get session attendance list (Use Case 02: Supervised Validation)
// ------------------------
router.get("/session-attendance/:sessionId", auth(["faculty"]), async (req, res) => {
  const { sessionId } = req.params;
  const faculty_id = req.user.id;

  try {
    // Verify session belongs to faculty
    const sessionCheck = await pool.query(
      `SELECT s.id, s.class_id, s.code, s.expires_at, c.faculty_id, c.course_code, c.title
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND c.faculty_id = $2`,
      [sessionId, faculty_id]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ message: "Session not found or access denied." });
    }

    const session = sessionCheck.rows[0];

    // Get all enrolled students for this class
    const enrolledStudents = await pool.query(
      `SELECT u.id, u.name, u.roll_no
       FROM users u
       INNER JOIN enrollments e ON e.student_id = u.id
       WHERE e.class_id = $1 AND u.role = 'student'
       ORDER BY u.name`,
      [session.class_id]
    );

    // Get attendance records for this session
    const attendanceRecords = await pool.query(
      `SELECT a.*, u.name, u.roll_no
       FROM attendance a
       INNER JOIN users u ON u.id = a.student_id
       WHERE a.session_id = $1
       ORDER BY u.name`,
      [sessionId]
    );

    // Map students with their attendance status
    const attendanceMap = new Map();
    attendanceRecords.rows.forEach((record) => {
      attendanceMap.set(record.student_id, {
        id: record.id,
        status: record.status,
        is_overridden: record.is_overridden,
        override_reason: record.override_reason,
        face_verified: record.face_verified,
        created_at: record.created_at,
      });
    });

    const attendanceList = enrolledStudents.rows.map((student) => ({
      student_id: student.id,
      name: student.name,
      roll_no: student.roll_no,
      attendance: attendanceMap.get(student.id) || null,
      present: attendanceMap.has(student.id),
    }));

    res.json({
      success: true,
      session: {
        id: session.id,
        code: session.code,
        expires_at: session.expires_at,
        course_code: session.course_code,
        course_title: session.title,
      },
      attendance: attendanceList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while fetching session attendance" });
  }
});

// ------------------------
// Manually mark attendance for student (Use Case 02: Supervised Validation)
// ------------------------
router.post("/manual-attendance", auth(["faculty"]), async (req, res) => {
  const { student_id, session_id, reason } = req.body;
  const faculty_id = req.user.id;

  try {
    if (!student_id || !session_id) {
      return res.status(400).json({ message: "Student ID and Session ID are required." });
    }

    // Verify session belongs to faculty
    const sessionCheck = await pool.query(
      `SELECT s.id, s.class_id, c.faculty_id
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND c.faculty_id = $2`,
      [session_id, faculty_id]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(403).json({ message: "You don't have permission to mark attendance for this session." });
    }

    // Verify student is enrolled
    const enrollmentCheck = await pool.query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND class_id = $2",
      [student_id, sessionCheck.rows[0].class_id]
    );

    if (enrollmentCheck.rowCount === 0) {
      return res.status(400).json({ message: "Student is not enrolled in this class." });
    }

    // Insert or update attendance
    const result = await pool.query(
      `INSERT INTO attendance (student_id, session_id, status, is_overridden, override_reason)
       VALUES ($1, $2, 'Manual', TRUE, $3)
       ON CONFLICT (student_id, session_id)
       DO UPDATE SET 
         status = 'Manual',
         is_overridden = TRUE,
         override_reason = $3
       RETURNING id, created_at`,
      [student_id, session_id, reason || "Manually marked by faculty"]
    );

    res.json({
      success: true,
      message: "Attendance marked manually.",
      attendance: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while marking manual attendance" });
  }
});

// ------------------------
// Enroll student in a class
// ------------------------
router.post("/enroll-student", auth(["faculty"]), async (req, res) => {
  const { student_id, class_id } = req.body;
  const faculty_id = req.user.id;

  try {
    if (!student_id || !class_id) {
      return res.status(400).json({ message: "Student ID and Class ID are required." });
    }

    // Verify the class belongs to this faculty
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND faculty_id = $2",
      [class_id, faculty_id]
    );
    if (classCheck.rowCount === 0) {
      return res.status(403).json({ message: "You don't have permission to enroll students in this class." });
    }

    // Verify the user is a student
    const studentCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'student'",
      [student_id]
    );
    if (studentCheck.rowCount === 0) {
      return res.status(400).json({ message: "Invalid student ID." });
    }

    // Enroll the student
    const result = await pool.query(
      "INSERT INTO enrollments (student_id, class_id) VALUES ($1, $2) RETURNING id",
      [student_id, class_id]
    );

    res.status(201).json({
      message: "Student enrolled successfully.",
      enrollment_id: result.rows[0].id,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Student is already enrolled in this class." });
    }
    console.error(err);
    res.status(500).json({ error: "Server error while enrolling student" });
  }
});

// ------------------------
// Get pending students for faculty approval
// ------------------------
router.get("/pending-students", auth(["faculty"]), async (req, res) => {
  const facultyId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT 
        ps.id as pending_id,
        ps.status,
        ps.created_at,
        ps.faculty_notes,
        u.id as student_id,
        u.name as student_name,
        u.email as student_email,
        u.roll_no as student_roll_no,
        u.mobile_number,
        u.country_code,
        u.college,
        u.passport_photo_url
      FROM pending_students ps
      JOIN users u ON ps.student_id = u.id
      WHERE ps.faculty_id = $1 AND ps.status = 'Pending'
      ORDER BY ps.created_at DESC`,
      [facultyId]
    );

    res.json({
      pendingStudents: result.rows.map((row) => ({
        pendingId: row.pending_id,
        status: row.status,
        createdAt: row.created_at,
        facultyNotes: row.faculty_notes,
        student: {
          id: row.student_id,
          name: row.student_name,
          email: row.student_email,
          rollNo: row.student_roll_no,
          mobileNumber: row.mobile_number,
          countryCode: row.country_code,
          college: row.college,
          passportPhotoUrl: row.passport_photo_url,
        },
      })),
    });
  } catch (err) {
    console.error("Error fetching pending students:", err);
    res.status(500).json({ error: "Server error while fetching pending students" });
  }
});

// ------------------------
// Approve or reject pending student
// ------------------------
router.post("/pending-students/:pendingId/approve", auth(["faculty"]), async (req, res) => {
  const facultyId = req.user.id;
  const { pendingId } = req.params;
  const { notes } = req.body;

  try {
    // Verify the pending request belongs to this faculty
    const checkResult = await pool.query(
      "SELECT student_id FROM pending_students WHERE id = $1 AND faculty_id = $2 AND status = 'Pending'",
      [pendingId, facultyId]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ message: "Pending student request not found or already processed" });
    }

    const studentId = checkResult.rows[0].student_id;

    // Update pending student status
    await pool.query(
      `UPDATE pending_students 
       SET status = 'Approved', 
           faculty_notes = $1, 
           resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [notes || null, pendingId]
    );

    res.json({
      success: true,
      message: "Student approved successfully",
      studentId: studentId,
    });
  } catch (err) {
    console.error("Error approving student:", err);
    res.status(500).json({ error: "Server error while approving student" });
  }
});

router.post("/pending-students/:pendingId/reject", auth(["faculty"]), async (req, res) => {
  const facultyId = req.user.id;
  const { pendingId } = req.params;
  const { notes } = req.body;

  try {
    // Verify the pending request belongs to this faculty
    const checkResult = await pool.query(
      "SELECT student_id FROM pending_students WHERE id = $1 AND faculty_id = $2 AND status = 'Pending'",
      [pendingId, facultyId]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ message: "Pending student request not found or already processed" });
    }

    // Update pending student status
    await pool.query(
      `UPDATE pending_students 
       SET status = 'Rejected', 
           faculty_notes = $1, 
           resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [notes || null, pendingId]
    );

    res.json({
      success: true,
      message: "Student request rejected",
    });
  } catch (err) {
    console.error("Error rejecting student:", err);
    res.status(500).json({ error: "Server error while rejecting student" });
  }
});

// @route   POST /api/faculty/registrations/:registrationId/approve
// @desc    Approve a course registration request
// @access  Private (faculty)
router.post("/registrations/:registrationId/approve", auth(["faculty"]), async (req, res) => {
  try {
    const facultyId = req.user.id;
    const { registrationId } = req.params;

    // Verify registration belongs to faculty
    const regCheck = await pool.query(
      `SELECT sr.*, u.name as student_name 
       FROM student_registrations sr
       JOIN users u ON sr.student_id = u.id
       WHERE sr.id = $1 AND sr.faculty_id = $2`,
      [registrationId, facultyId]
    );

    if (regCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Registration request not found or you don't have access to it.",
      });
    }

    const registration = regCheck.rows[0];

    if (registration.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Registration request has already been processed.",
      });
    }

    // Update status to approved
    await pool.query(
      `UPDATE student_registrations 
       SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [registrationId]
    );

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`student:${registration.student_id}`).emit("registration:approved", {
        registrationId,
        courseId: registration.course_id,
        facultyId: facultyId,
      });
      io.to(`faculty:${facultyId}`).emit("registration:processed", {
        registrationId,
        status: "approved",
      });
    }

    res.json({
      success: true,
      message: "Course registration approved successfully.",
    });
  } catch (err) {
    console.error("Error approving registration:", err);
    res.status(500).json({
      success: false,
      error: "Server error while approving registration.",
    });
  }
});

// @route   POST /api/faculty/registrations/:registrationId/reject
// @desc    Reject a course registration request
// @access  Private (faculty)
router.post("/registrations/:registrationId/reject", auth(["faculty"]), async (req, res) => {
  try {
    const facultyId = req.user.id;
    const { registrationId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required.",
      });
    }

    // Verify registration belongs to faculty
    const regCheck = await pool.query(
      `SELECT sr.*, u.name as student_name 
       FROM student_registrations sr
       JOIN users u ON sr.student_id = u.id
       WHERE sr.id = $1 AND sr.faculty_id = $2`,
      [registrationId, facultyId]
    );

    if (regCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Registration request not found or you don't have access to it.",
      });
    }

    const registration = regCheck.rows[0];

    if (registration.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Registration request has already been processed.",
      });
    }

    // Update status to rejected
    await pool.query(
      `UPDATE student_registrations 
       SET status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reason.trim(), registrationId]
    );

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`student:${registration.student_id}`).emit("registration:rejected", {
        registrationId,
        courseId: registration.course_id,
        facultyId: facultyId,
        reason: reason.trim(),
      });
      io.to(`faculty:${facultyId}`).emit("registration:processed", {
        registrationId,
        status: "rejected",
      });
    }

    res.json({
      success: true,
      message: "Course registration rejected successfully.",
    });
  } catch (err) {
    console.error("Error rejecting registration:", err);
    res.status(500).json({
      success: false,
      error: "Server error while rejecting registration.",
    });
  }
});

module.exports = router;
