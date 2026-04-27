// backend/dbMonitor.js
// Lightweight PostgreSQL monitoring helpers for index usage and slow queries.
//
// These helpers assume:
// - The main connection pool is configured in ./db.js
// - The pg_stat_statements extension is enabled at the database level, e.g.:
//     CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
//
// They are designed for on-demand diagnostics (admin tools, scripts, or
// scheduled jobs) and should not be called on every user request.

const pool = require("./db");

/**
 * Fetch indexes that have never been scanned since the last statistics reset.
 *
 * This is useful to identify:
 * - Redundant or unused indexes that add write overhead and bloat
 * - Candidate indexes for review / removal after manual verification
 *
 * NOTE:
 * - Statistics reset when PostgreSQL is restarted or when
 *   pg_stat_reset() / pg_stat_reset_shared() is called.
 * - Always review indexes carefully before dropping them, especially on
 *   write-heavy tables.
 *
 * @returns {Promise<Array<{ schemaname: string, table_name: string, index_name: string, idx_scan: number }>>}
 */
async function getUnusedIndexes() {
  const sql = `
    SELECT
      schemaname,
      relname AS table_name,
      indexrelname AS index_name,
      idx_scan
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0;
  `;

  const { rows } = await pool.query(sql);
  return rows;
}

/**
 * Fetch the top 10 slowest queries by mean execution time from pg_stat_statements.
 *
 * This is useful to:
 * - Identify queries that need better indexes or query rewriting
 * - Prioritize performance work based on actual production workload
 *
 * REQUIREMENTS:
 * - pg_stat_statements must be installed and configured in postgresql.conf, e.g.:
 *     shared_preload_libraries = 'pg_stat_statements'
 *     pg_stat_statements.track = all
 *
 * @returns {Promise<Array<{ query: string, calls: number, total_exec_time: number, mean_exec_time: number }>>}
 */
async function getSlowQueries() {
  const sql = `
    SELECT
      query,
      calls,
      total_exec_time,
      mean_exec_time
    FROM pg_stat_statements
    ORDER BY mean_exec_time DESC
    LIMIT 10;
  `;

  const { rows } = await pool.query(sql);
  return rows;
}

module.exports = {
  getUnusedIndexes,
  getSlowQueries,
};

