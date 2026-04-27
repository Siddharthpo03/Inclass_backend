// Script to create the database if it doesn't exist
// Run this FIRST before running schema.sql
// Usage: node scripts/create-database.js

const { Client } = require("pg");
require("dotenv").config();

async function createDatabase() {
  // Connect to PostgreSQL server (not to a specific database)
  const adminClient = new Client({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: "postgres", // Connect to default postgres database
  });

  try {
    await adminClient.connect();
    console.log("✅ Connected to PostgreSQL server");

    // Extract database name from DATABASE_URL or use default
    let dbName;
    if (process.env.DATABASE_URL) {
      // Parse DATABASE_URL: postgresql://user:pass@host:port/dbname
      const url = new URL(process.env.DATABASE_URL);
      dbName = url.pathname.slice(1).replace(/\/$/, ""); // Remove leading / and trailing slash
    } else {
      dbName = process.env.DB_NAME || "inclass";
    }

    // SEC-007: Sanitize database name (CREATE DATABASE does not support $1; allow only safe chars)
    const sanitizedDbName = dbName.replace(/[^a-zA-Z0-9_]/g, "");
    if (!sanitizedDbName || sanitizedDbName !== dbName) {
      console.error("❌ Invalid database name: only letters, numbers, and underscores allowed.");
      process.exit(1);
    }
    dbName = sanitizedDbName;

    console.log(`🔍 Checking if database "${dbName}" exists...`);

    // SECURE: Parameterized query prevents SQL injection
    const result = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (result.rowCount === 0) {
      console.log(`📦 Creating database "${dbName}"...`);
      // SEC-007: dbName is sanitized (alphanumeric + underscore only); identifier quoted to be safe
      await adminClient.query("CREATE DATABASE \"" + dbName.replace(/"/g, '""') + "\"");
      console.log(`✅ Database "${dbName}" created successfully!`);
    } else {
      console.log(`✅ Database "${dbName}" already exists`);
    }

    await adminClient.end();
    console.log("\n✅ Next step: Run the schema.sql file in pgAdmin or use:");
    console.log(`   node scripts/setup-schema.js`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "3D000") {
      console.error("   Database doesn't exist (this is expected for first run)");
    } else if (error.code === "28P01") {
      console.error("   Authentication failed. Check your DB_USER and DB_PASSWORD in .env");
    } else if (error.code === "ECONNREFUSED") {
      console.error("   Could not connect to PostgreSQL. Make sure PostgreSQL is running.");
    }
    process.exit(1);
  }
}

createDatabase();

