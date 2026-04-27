// Script to run schema.sql and create all tables
// Run this: node scripts/run-schema.js

const pool = require("../db");
const fs = require("fs");
const path = require("path");

async function runSchema() {
  try {
    console.log("📖 Reading schema.sql...");
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");
    
    console.log("🔨 Executing schema...");
    // Split by semicolons and execute each statement
    const statements = schemaSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 10) { // Skip very short statements
        try {
          await pool.query(statement);
          console.log(`✅ Executed statement ${i + 1}/${statements.length}`);
        } catch (err) {
          // Ignore "already exists" errors
          if (err.code === "42P07" || err.code === "42710" || err.message.includes("already exists")) {
            console.log(`⚠️  Statement ${i + 1} skipped (already exists)`);
          } else {
            console.error(`❌ Error in statement ${i + 1}:`, err.message);
            // Continue with other statements
          }
        }
      }
    }
    
    console.log("✅ Schema execution completed!");
    
    // Verify departments were created
    const deptCheck = await pool.query("SELECT COUNT(*) as count FROM departments WHERE is_active = true");
    console.log(`📊 Departments in database: ${deptCheck.rows[0].count}`);
    
    // Verify colleges were created
    const collegeCheck = await pool.query("SELECT COUNT(*) as count FROM colleges WHERE is_active = true");
    console.log(`📊 Colleges in database: ${collegeCheck.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error running schema:", error);
    process.exit(1);
  }
}

runSchema();

