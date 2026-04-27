// Jest setup: ensure database pool is closed after all tests so that
// no PostgreSQL TCP connections remain as open handles.

const pool = require("../db");

afterAll(async () => {
  await pool.end();
});

