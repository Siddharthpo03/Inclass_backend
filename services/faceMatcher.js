// inclass-backend/services/faceMatcher.js
// Face embedding persistence and similarity search
// Supports both pgvector (fast) and native float8[] (fallback) modes.

const { pool, pgvector, isVectorReady, getVectorMode } = require("../config/database");

const DEFAULT_THRESHOLD = parseFloat(process.env.FACE_DISTANCE_THRESHOLD || "0.6");

function ensureVector() {
  if (!isVectorReady()) {
    throw new Error(
      "Vector support is not available. Face matching is disabled."
    );
  }
}

function toSqlValue(embedding) {
  if (getVectorMode() === "pgvector" && pgvector) {
    return pgvector.toSql(embedding);
  }
  // Native mode: pass a raw JS array → pg driver sends it as a PostgreSQL array literal
  return embedding;
}

/**
 * Store or update FaceNet embedding for a user in the users table.
 */
async function saveUserEmbedding(userId, embedding) {
  ensureVector();
  if (!userId) {
    throw new Error("userId is required to save embedding");
  }
  if (!Array.isArray(embedding) || embedding.length !== 512) {
    throw new Error("Embedding must be a 512-dim array");
  }

  const value = toSqlValue(embedding);

  await pool.query("UPDATE users SET embedding = $1 WHERE id = $2", [
    value,
    userId,
  ]);
}

/**
 * Find the closest user to the given embedding using cosine distance.
 */
async function findBestMatch(embedding, threshold = DEFAULT_THRESHOLD) {
  ensureVector();
  if (!Array.isArray(embedding) || embedding.length !== 512) {
    throw new Error("Embedding must be a 512-dim array");
  }

  const value = toSqlValue(embedding);

  let query;
  if (getVectorMode() === "pgvector") {
    query = `
      SELECT id, name, embedding <=> $1 AS distance
      FROM users
      WHERE embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 1
    `;
  } else {
    query = `
      SELECT id, name, cosine_distance(embedding, $1) AS distance
      FROM users
      WHERE embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 1
    `;
  }

  const { rows } = await pool.query(query, [value]);

  if (rows.length === 0) {
    return null;
  }

  const best = rows[0];
  const distance = parseFloat(best.distance);
  const match = distance < threshold;

  return {
    match,
    userId: best.id,
    name: best.name,
    distance,
    threshold,
  };
}

module.exports = {
  saveUserEmbedding,
  findBestMatch,
  DEFAULT_THRESHOLD,
};
