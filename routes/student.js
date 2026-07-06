// inclass-backend/routes/student.js

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const auth = require("../middleware/auth");

function buildDateFilter(range) {
  switch ((range || "all").toLowerCase()) {
    case "week":
      return "AND a.marked_at >= NOW() - INTERVAL '7 days'";
    case "month":
      return "AND a.marked_at >= NOW() - INTERVAL '30 days'";
    default:
      return "";
  }
}

router.get("/active-sessions", auth(["student"]), async (req, res) => {
  const studentId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.session_code,
         s.code_expires_at,
         s.created_at,
         c.id AS course_id,
         c.title AS course_name,
         c.code AS course_code,
         u.name AS faculty_name
       FROM sessions s
       INNER JOIN courses c ON c.id = s.course_id
       INNER JOIN users u ON u.id = c.faculty_id
       INNER JOIN registrations r ON r.course_id = c.id
       WHERE r.student_id = $1
         AND s.is_active = TRUE
         AND (s.code_expires_at IS NULL OR s.code_expires_at > NOW())
         AND r.student_id = $1
         AND r.status = 'approved'
       ORDER BY s.created_at DESC`,
      [studentId],
    );

    res.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        name: row.course_name,
        faculty: row.faculty_name,
        room: row.course_code,
        time: row.code_expires_at
          ? new Date(row.code_expires_at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
        code: row.session_code,
        sessionCode: row.session_code,
        classId: row.course_id,
        courseId: row.course_id,
        expiresAt: row.code_expires_at,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch active sessions:", error);
    res.status(500).json({
      success: false,
      error: { message: "Failed to fetch active sessions." },
    });
  }
});

router.get("/attendance-history", auth(["student"]), async (req, res) => {
  const studentId = req.user.id;
  const dateFilter = buildDateFilter(req.query.range);

  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.marked_at AS date,
         a.status,
         c.title AS subject,
         c.code AS course_code,
         u.name AS faculty
       FROM attendance a
       INNER JOIN sessions s ON s.id = a.session_id
       INNER JOIN courses c ON c.id = s.course_id
       INNER JOIN users u ON u.id = c.faculty_id
       WHERE a.student_id = $1
       ${dateFilter}
       ORDER BY a.marked_at DESC
       LIMIT 100`,
      [studentId],
    );

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        date: row.date,
        status: row.status,
        subject: row.subject,
        faculty: row.faculty,
        courseCode: row.course_code,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch attendance history:", error);
    res.status(500).json({
      success: false,
      error: { message: "Failed to fetch attendance history." },
    });
  }
});

router.get("/attendance-stats", auth(["student"]), async (req, res) => {
  const studentId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_classes,
         COUNT(*) FILTER (WHERE LOWER(status) = 'present')::int AS present,
         COUNT(*) FILTER (WHERE LOWER(status) = 'absent')::int AS absent
       FROM attendance
       WHERE student_id = $1`,
      [studentId],
    );

    const stats = result.rows[0] || {
      total_classes: 0,
      present: 0,
      absent: 0,
    };
    const totalClasses = Number(stats.total_classes || 0);
    const present = Number(stats.present || 0);
    const absent = Number(stats.absent || 0);
    const percentage =
      totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0;

    res.json({
      percentage,
      totalClasses,
      present,
      absent,
    });
  } catch (error) {
    console.error("Failed to fetch attendance stats:", error);
    res.status(500).json({
      success: false,
      error: { message: "Failed to fetch attendance stats." },
    });
  }
});

module.exports = router;
