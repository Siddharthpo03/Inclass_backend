// backend/jobs/duplicateDetection.js
// P3 DB-004: Duplicate attendance detection and optional cleanup.
//
// Duplicates are defined as: same (student_id, session_id) with more than one row.
// The first row per (student_id, session_id) by created_at is kept as canonical;
// all later rows are marked is_duplicate = TRUE (or optionally deleted).
//
// This job does not change how attendance is inserted; it only updates or deletes
// existing rows. Existing attendance APIs and inserts remain unchanged.

const pool = require("../db");
const logger = require("../utils/logger");

const LOG_PREFIX = "[DuplicateDetection]";

/**
 * Marks duplicate attendance rows by setting is_duplicate = TRUE.
 * For each (student_id, session_id), the earliest row by created_at is kept
 * as the canonical record; all subsequent rows are marked as duplicate.
 *
 * @returns {Promise<{ updated: number }>} Number of rows updated.
 */
async function detectDuplicateAttendance() {
  const client = await pool.connect();
  try {
    // Subquery: number rows per (student_id, session_id) by time (created_at).
    // row_num > 1 => duplicate; we keep the first by timestamp (created_at).
    const updateSql = `
      UPDATE attendance
      SET is_duplicate = TRUE
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY student_id, session_id
              ORDER BY created_at ASC
            ) AS row_num
          FROM attendance
        ) t
        WHERE t.row_num > 1
      );
    `;
    const result = await client.query(updateSql);
    const updated = result.rowCount ?? 0;
    if (updated > 0) {
      logger.info(`Marked ${updated} duplicate attendance row(s).`);
    } else {
      logger.info("No duplicate attendance rows to mark.");
    }
    return { updated };
  } finally {
    client.release();
  }
}

/**
 * Deletes attendance rows that are already marked as duplicates.
 * Optional: use only when you want to physically remove duplicates (e.g. after
 * review). Prefer leaving them marked with is_duplicate = TRUE for audit.
 *
 * @returns {Promise<{ deleted: number }>} Number of rows deleted.
 */
async function deleteDuplicateAttendance() {
  const client = await pool.connect();
  try {
    const deleteSql = `
      DELETE FROM attendance
      WHERE is_duplicate = TRUE;
    `;
    const result = await client.query(deleteSql);
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info(`Deleted ${deleted} duplicate attendance row(s).`);
    } else {
      logger.info("No duplicate attendance rows to delete.");
    }
    return { deleted };
  } finally {
    client.release();
  }
}

/**
 * Runs duplicate detection and logs any error without throwing (so the cron
 * or caller does not crash). Call this from the scheduled job.
 */
async function runDuplicateDetectionJob() {
  try {
    logger.info("Starting scheduled duplicate detection.");
    const { updated } = await detectDuplicateAttendance();
    logger.info(`Finished. Updated: ${updated}`);
  } catch (err) {
    logger.error("Error during duplicate detection: " + err.message);
    logger.error(err);
  }
}

/**
 * Schedules duplicate detection to run every day at 2:00 AM (server local time).
 * Call once after the app is ready (e.g. after DB pool is available).
 *
 * @returns {object} The cron instance so it can be stopped if needed (e.g. in tests).
 */
function startDuplicateDetectionSchedule() {
  let cron;
  try {
    cron = require("node-cron");
  } catch (e) {
    logger.warn(
      "node-cron not installed. Skipping schedule. Run duplicate detection manually or add node-cron.",
    );
    return null;
  }

  // 2 AM every day: minute=0, hour=2
  const task = cron.schedule("0 2 * * *", runDuplicateDetectionJob, {
    scheduled: true,
    timezone: process.env.TZ || undefined,
  });

  logger.info("Scheduled to run daily at 2:00 AM.");
  return task;
}

module.exports = {
  detectDuplicateAttendance,
  deleteDuplicateAttendance,
  runDuplicateDetectionJob,
  startDuplicateDetectionSchedule,
};
