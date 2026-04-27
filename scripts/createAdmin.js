// Script to create admin accounts from backend
// Usage: node scripts/createAdmin.js "Admin Name" "admin@example.com" "password123"

const bcrypt = require("bcrypt");
const pool = require("../db");
require("dotenv").config();

async function createAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("❌ Usage: node scripts/createAdmin.js <name> <email> <password> [roll_no]");
    console.error("   Example: node scripts/createAdmin.js 'John Admin' 'admin@inclass.com' 'SecurePass123' 'ADM001'");
    process.exit(1);
  }

  const [name, email, password, roll_no] = args;

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("❌ Invalid email format");
    process.exit(1);
  }

  // Validate password length
  if (password.length < 6) {
    console.error("❌ Password must be at least 6 characters");
    process.exit(1);
  }

  try {
    // Check if email already exists
    const existingUser = await pool.query(
      "SELECT id, email, role FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rowCount > 0) {
      console.error(`❌ User with email ${email} already exists (Role: ${existingUser.rows[0].role})`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin user
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, roll_no)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, name, email, role, roll_no, created_at`,
      [name, email, hashedPassword, roll_no || null]
    );

    const admin = result.rows[0];

    console.log("✅ Admin account created successfully!");
    console.log("\n📋 Admin Details:");
    console.log(`   ID: ${admin.id}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Roll No: ${admin.roll_no || "N/A"}`);
    console.log(`   Created At: ${admin.created_at}`);
    console.log("\n🔐 Login Credentials:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log("\n⚠️  Please save these credentials securely!");
    console.log("\n💡 The admin can now login at the frontend using this email.");
    console.log("   The system will automatically detect it's an admin account.");

    process.exit(0);
  } catch (error) {
    if (error.code === "23505") {
      console.error(`❌ Email ${email} already exists in the database`);
    } else {
      console.error("❌ Error creating admin:", error.message);
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the script
createAdmin();

