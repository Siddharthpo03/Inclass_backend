// Script to verify database setup
// Run this to check if all tables exist
// Usage: node scripts/verify-database.js

const pool = require("../db");

const requiredTables = [
  "users",
  "colleges",
  "departments",
  "classes",
  "sessions",
  "enrollments",
  "face_encodings",
  "fingerprint_data",
  "webauthn_credentials",
  "biometric_face",
  "biometric_consent",
  "attendance",
  "expired_code_reports",
  "pending_students",
  "otps",
  "courses",
  "student_registrations",
  "fingerprint_templates",
];

const requiredColumns = {
  users: [
    "id",
    "name",
    "email",
    "password",
    "role",
    "roll_no",
    "mobile_number",
    "country_code",
    "passport_photo_url",
    "college",
    "department",
    "college_id",
    "department_id",
    "face_enrolled",
    "fingerprint_enrolled",
  ],
};

async function verifyDatabase() {
  try {
    console.log("🔍 Verifying database setup...\n");

    // Check connection
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful\n");

    // Check tables
    console.log("📊 Checking tables...");
    let allTablesExist = true;
    for (const table of requiredTables) {
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
        allTablesExist = false;
      }
    }

    if (!allTablesExist) {
      console.log("\n❌ Some tables are missing. Run: node scripts/setup-schema.js");
      process.exit(1);
    }

    // Check users table columns
    console.log("\n📊 Checking users table columns...");
    const usersColumns = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND table_schema = 'public'`
    );
    const existingColumns = usersColumns.rows.map((r) => r.column_name);
    let allColumnsExist = true;
    for (const col of requiredColumns.users) {
      if (existingColumns.includes(col)) {
        console.log(`   ✅ ${col}`);
      } else {
        console.log(`   ❌ ${col} - MISSING!`);
        allColumnsExist = false;
      }
    }

    // Check data
    console.log("\n📊 Checking data...");
    try {
      const collegesCount = await pool.query(
        "SELECT COUNT(*) as count FROM colleges WHERE is_active = true"
      );
      console.log(`   📚 Colleges: ${collegesCount.rows[0].count}`);
      if (parseInt(collegesCount.rows[0].count) === 0) {
        console.log("   ⚠️  No colleges found. Run: node scripts/setup-colleges.js");
      }
    } catch (e) {
      console.log(`   ❌ Colleges: ${e.message}`);
    }

    try {
      const deptCount = await pool.query(
        "SELECT COUNT(*) as count FROM departments WHERE is_active = true"
      );
      console.log(`   📚 Departments: ${deptCount.rows[0].count}`);
      if (parseInt(deptCount.rows[0].count) === 0) {
        console.log("   ⚠️  No departments found. Run: node scripts/setup-departments.js");
      }
    } catch (e) {
      console.log(`   ❌ Departments: ${e.message}`);
    }

    if (allTablesExist && allColumnsExist) {
      console.log("\n✅ Database setup is complete!");
      process.exit(0);
    } else {
      console.log("\n❌ Database setup incomplete. Please run the setup scripts.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Error verifying database:", error.message);
    if (error.code === "3D000") {
      console.error("   Database doesn't exist. Run: node scripts/create-database.js");
    } else if (error.code === "28P01") {
      console.error("   Authentication failed. Check your .env file");
    } else if (error.code === "ECONNREFUSED") {
      console.error("   Could not connect to PostgreSQL. Make sure PostgreSQL is running.");
    }
    process.exit(1);
  }
}

verifyDatabase();

