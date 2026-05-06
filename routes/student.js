// inclass-backend/routes/student.js

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const auth = require("../middleware/auth");

function buildDateFilter(range) {
  switch ((range || "all").toLowerCase()) {
    case "week":
      return "AND a.created_at >= NOW() - INTERVAL '7 days'";
    case "month":
      return "AND a.created_at >= NOW() - INTERVAL '30 days'";
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
         s.class_id,
         s.code,
         s.expires_at,
         s.created_at,
         c.title AS class_name,
         c.course_code,
         u.name AS faculty_name
       FROM sessions s
       INNER JOIN classes c ON c.id = s.class_id
       INNER JOIN users u ON u.id = c.faculty_id
       INNER JOIN enrollments e ON e.class_id = c.id
       WHERE e.student_id = $1
         AND s.is_active = TRUE
         AND s.expires_at > NOW()
       ORDER BY s.created_at DESC`,
      [studentId],
    );

    res.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        name: row.class_name,
        faculty: row.faculty_name,
        room: row.course_code,
        time: new Date(row.expires_at).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        code: row.code,
        classId: row.class_id,
        expiresAt: row.expires_at,
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
         a.created_at AS date,
         a.status,
         c.title AS subject,
         c.course_code,
         u.name AS faculty
       FROM attendance a
       INNER JOIN sessions s ON s.id = a.session_id
       INNER JOIN classes c ON c.id = s.class_id
       INNER JOIN users u ON u.id = c.faculty_id
       WHERE a.student_id = $1
       ${dateFilter}
       ORDER BY a.created_at DESC
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
         COUNT(*) FILTER (WHERE status = 'Present')::int AS present,
         COUNT(*) FILTER (WHERE status = 'Absent')::int AS absent
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
    const percentage = totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0;

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