// Script to list all admin accounts
// Usage: node scripts/listAdmins.js

const pool = require("../db");
require("dotenv").config();

async function listAdmins() {
  try {
    const result = await pool.query(
      `SELECT id, name, email, roll_no, created_at
       FROM users
       WHERE role = 'admin'
       ORDER BY created_at DESC`
    );

    if (result.rowCount === 0) {
      console.log("ℹ️  No admin accounts found in the database.");
      process.exit(0);
    }

    console.log(`\n📋 Found ${result.rowCount} admin account(s):\n`);
    console.log("─".repeat(80));

    result.rows.forEach((admin, index) => {
      console.log(`\n${index + 1}. Admin Account:`);
      console.log(`   ID: ${admin.id}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Roll No: ${admin.roll_no || "N/A"}`);
      console.log(`   Created: ${new Date(admin.created_at).toLocaleString()}`);
    });

    console.log("\n" + "─".repeat(80));
    process.exit(0);
  } catch (error) {
    console.error("❌ Error listing admins:", error.message);
    process.exit(1);
  }
}

listAdmins();

