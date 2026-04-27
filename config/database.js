// inclass-backend/config/database.js
// Centralized database + pgvector configuration
// Falls back to native float8[] arrays when the pgvector extension is unavailable.

const pool = require("../db");
const logger = require("../utils/logger");

let pgvector;
try {
  pgvector = require("pgvector/pg");
} catch {
  pgvector = null;
}

let vectorMode = "none"; // "pgvector" | "native" | "none"

/**
 * Initialise vector support.
 *  1. Try pgvector extension  → fastest (HNSW / IVFFlat indexes)
 *  2. Fall back to float8[]   → works on any PostgreSQL without extensions
 */
async function initVectorSupport() {
  const client = await pool.connect();
  try {
    // --- Attempt pgvector first ---
    if (pgvector) {
      try {
        await client.query("CREATE EXTENSION IF NOT EXISTS vector");
        await pgvector.registerTypes(client);

        // Only alter if users table already exists (schema may not be applied yet)
        const { rows: tbl } = await client.query(`
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'users' AND table_schema = 'public'
        `);
        if (tbl.length > 0) {
          await client.query(`
            DO $$ BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'embedding'
              ) THEN
                ALTER TABLE users ADD COLUMN embedding vector(512);
              END IF;
            END $$;
          `);
        }

        vectorMode = "pgvector";
        logger.info("pgvector extension ready (vector(512) column ensured)");
        return;
      } catch {
        // pgvector not available on this server – fall through to native path
      }
    }

    // --- Native float8[] fallback ---
    // Check if the users table exists before trying to add the column
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'users' AND table_schema = 'public'
    `);

    if (rows.length > 0) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'embedding'
          ) THEN
            ALTER TABLE users ADD COLUMN embedding float8[];
          END IF;
        END $$;
      `);
    }

    // Cosine distance helper for native arrays
    await client.query(`
      CREATE OR REPLACE FUNCTION cosine_distance(a float8[], b float8[])
      RETURNS float8 AS $$
      DECLARE
        dot float8 := 0;
        norm_a float8 := 0;
        norm_b float8 := 0;
        i int;
      BEGIN
        FOR i IN 1 .. array_length(a, 1) LOOP
          dot    := dot    + a[i] * b[i];
          norm_a := norm_a + a[i] * a[i];
          norm_b := norm_b + b[i] * b[i];
        END LOOP;
        IF norm_a = 0 OR norm_b = 0 THEN RETURN 2; END IF;
        RETURN 1.0 - (dot / (sqrt(norm_a) * sqrt(norm_b)));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE STRICT;
    `);

    vectorMode = "native";
    logger.info(
      "Vector support ready (native float8[] + cosine_distance function)",
    );
  } finally {
    client.release();
  }
}

// Register pgvector types for subsequent pool clients when using pgvector mode
pool.on("connect", async (client) => {
  if (vectorMode !== "pgvector" || !pgvector) return;
  try {
    await pgvector.registerTypes(client);
  } catch {
    // Already warned at startup
  }
});

function getVectorMode() {
  return vectorMode;
}

function isVectorReady() {
  return vectorMode !== "none";
}

module.exports = {
  pool,
  pgvector,
  initVectorSupport,
  isVectorReady,
  getVectorMode,
};
