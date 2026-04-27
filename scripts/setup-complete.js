// Complete database setup script
// This creates the database and runs the schema
// Usage: node scripts/setup-complete.js

const { Client } = require("pg");
require("dotenv").config();

async function setupComplete() {
  // Step 1: Create database if it doesn't exist
  const adminClient = new Client({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: "postgres",
  });

  try {
    await adminClient.connect();
    console.log("✅ Connected to PostgreSQL server");

    let dbName;
    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      dbName = url.pathname.slice(1).replace(/\/$/, "");
    } else {
      dbName = process.env.DB_NAME || "inclass";
    }

    // SEC-007: Sanitize database name (CREATE DATABASE does not support $1)
    const sanitizedDbName = dbName.replace(/[^a-zA-Z0-9_]/g, "");
    if (!sanitizedDbName || sanitizedDbName !== dbName) {
      console.error("❌ Invalid database name: only letters, numbers, and underscores allowed.");
      process.exit(1);
    }
    dbName = sanitizedDbName;

    console.log(`🔍 Checking database "${dbName}"...`);
    // SECURE: Parameterized query prevents SQL injection
    const dbCheck = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (dbCheck.rowCount === 0) {
      console.log(`📦 Creating database "${dbName}"...`);
      // SEC-007: dbName sanitized; quote identifier safely
      await adminClient.query("CREATE DATABASE \"" + dbName.replace(/"/g, '""') + "\"");
      console.log(`✅ Database created!`);
    } else {
      console.log(`✅ Database exists`);
    }
    await adminClient.end();
  } catch (error) {
    console.error("❌ Error creating database:", error.message);
    if (error.code !== "3D000") {
      process.exit(1);
    }
  }

  // Step 2: Connect to the target database and run schema
  const pool = require("../db");
  const fs = require("fs");
  const path = require("path");

  try {
    console.log("\n📖 Reading schema.sql...");
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");

    console.log("🔨 Executing schema...\n");

    // Use a client connection for better error handling
    const client = await pool.connect();

    try {
      // Execute schema in smaller chunks to avoid issues
      // First, create all tables
      console.log("   Step 1: Creating tables...");
      
      // Execute the entire schema - PostgreSQL should handle it
      await client.query(schemaSQL);
      
      console.log("   ✅ Schema executed successfully!\n");
    } catch (err) {
      // If error, try to continue - some objects might already exist
      if (err.code === "42P07" || err.code === "42710") {
        console.log("   ⚠️  Some objects already exist (continuing...)");
      } else {
        console.error("   ❌ Error:", err.message);
        console.error("   Code:", err.code);
        throw err;
      }
    } finally {
      client.release();
    }

    // Step 3: Verify setup
    console.log("📊 Verifying setup...");
    const tables = ["users", "colleges", "departments", "classes", "sessions"];
    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )`,
        [table]
      );
      if (result.rows[0].exists) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} - MISSING`);
      }
    }

    // Check data
    try {
      const collegesCount = await pool.query("SELECT COUNT(*) as count FROM colleges WHERE is_active = true");
      const deptCount = await pool.query("SELECT COUNT(*) as count FROM departments WHERE is_active = true");
      console.log(`\n📊 Data: ${collegesCount.rows[0].count} colleges, ${deptCount.rows[0].count} departments`);
    } catch (e) {
      console.log("\n⚠️  Could not check data counts");
    }

    console.log("\n✅ Database setup complete!");
    console.log("   You can now start your backend server.");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
}

setupComplete();

