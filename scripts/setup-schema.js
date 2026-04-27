// Script to run the complete schema.sql file
// This will create all tables, indexes, and insert initial data
// Usage: node scripts/setup-schema.js

const pool = require("../db");
const fs = require("fs");
const path = require("path");

async function setupSchema() {
  try {
    console.log("📖 Reading schema.sql...");
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ schema.sql not found at: ${schemaPath}`);
      process.exit(1);
    }
    
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");
    
    console.log("🔨 Executing schema...");
    console.log("   This may take a few moments...\n");
    console.log("   ⚠️  NOTE: If you get errors, use pgAdmin Query Tool instead (see SETUP_INSTRUCTIONS.md)\n");

    // Split SQL into statements, handling DO blocks properly
    // We'll execute in chunks: tables first, then indexes, then data
    
    // Extract DO blocks (they contain semicolons)
    const doBlockRegex = /DO\s+\$\$[\s\S]*?\$\$;/g;
    const doBlocks = schemaSQL.match(doBlockRegex) || [];
    let sqlWithoutDoBlocks = schemaSQL;
    doBlocks.forEach((block, idx) => {
      sqlWithoutDoBlocks = sqlWithoutDoBlocks.replace(block, `__DO_BLOCK_${idx}__`);
    });

    // Split remaining SQL by semicolons
    const statements = sqlWithoutDoBlocks
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        const trimmed = s.trim();
        return trimmed.length > 10 && 
               !trimmed.startsWith('--') && 
               !trimmed.match(/^\/\*/);
      });

    // Restore DO blocks
    statements.forEach((stmt, idx) => {
      doBlocks.forEach((block, blockIdx) => {
        if (stmt.includes(`__DO_BLOCK_${blockIdx}__`)) {
          statements[idx] = stmt.replace(`__DO_BLOCK_${blockIdx}__`, block);
        }
      });
    });

    const client = await pool.connect();
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      console.log(`   Executing ${statements.length} statements...\n`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement || statement.length < 10) continue;

        try {
          await client.query(statement);
          successCount++;
          if ((i + 1) % 5 === 0) {
            process.stdout.write(`   Progress: ${i + 1}/${statements.length} statements\r`);
          }
        } catch (err) {
          // Ignore "already exists" errors
          if (err.code === "42P07" || err.code === "42710" || err.code === "42P16" ||
              err.message.includes("already exists") ||
              err.message.includes("duplicate key value")) {
            successCount++;
          } else {
            errorCount++;
            errors.push({ statement: i + 1, error: err.message, code: err.code });
            // Continue with other statements
          }
        }
      }
      
      console.log(`\n\n✅ Schema execution completed!`);
      console.log(`   ✅ Successful: ${successCount}`);
      if (errorCount > 0) {
        console.log(`   ⚠️  Errors: ${errorCount}`);
        console.log(`\n   If you see errors, try using pgAdmin Query Tool instead:`);
        console.log(`   1. Open pgAdmin`);
        console.log(`   2. Right-click your database → Query Tool`);
        console.log(`   3. Open schema.sql file`);
        console.log(`   4. Execute (F5)`);
      }
    } finally {
      client.release();
    }
    
    // Verify key tables exist
    const tables = [
      "users",
      "colleges",
      "departments",
      "classes",
      "sessions",
      "enrollments",
      "attendance",
      "webauthn_credentials",
      "biometric_face",
      "biometric_consent",
      "otps",
      "courses",
      "student_registrations",
    ];

    console.log("\n📊 Verifying tables...");
    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      if (result.rows[0].exists) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} - MISSING!`);
      }
    }

    // Check data counts
    console.log("\n📊 Checking data...");
    try {
      const collegesCount = await pool.query("SELECT COUNT(*) as count FROM colleges WHERE is_active = true");
      console.log(`   📚 Colleges: ${collegesCount.rows[0].count}`);
    } catch (e) {
      console.log(`   ⚠️  Colleges: Error checking`);
    }

    try {
      const deptCount = await pool.query("SELECT COUNT(*) as count FROM departments WHERE is_active = true");
      console.log(`   📚 Departments: ${deptCount.rows[0].count}`);
    } catch (e) {
      console.log(`   ⚠️  Departments: Error checking`);
    }

    console.log("\n✅ Database setup complete!");
    console.log("   You can now start your backend server.");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error running schema:", error.message);
    console.error("   Error code:", error.code);
    if (error.position) {
      console.error("   Error position:", error.position);
    }
    process.exit(1);
  }
}

setupSchema();

