// Script to delete an admin account by email
// Usage: node scripts/deleteAdmin.js "admin@example.com"

const pool = require("../db");
require("dotenv").config();

async function deleteAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("❌ Usage: node scripts/deleteAdmin.js <email>");
    console.error("   Example: node scripts/deleteAdmin.js 'admin@inclass.com'");
    process.exit(1);
  }

  const email = args[0];

  try {
    // Check if admin exists
    const existingAdmin = await pool.query(
      "SELECT id, name, email, role FROM users WHERE email = $1 AND role = 'admin'",
      [email]
    );

    if (existingAdmin.rowCount === 0) {
      console.error(`❌ No admin account found with email: ${email}`);
      process.exit(1);
    }

    const admin = existingAdmin.rows[0];

    // Confirm deletion
    console.log(`\n⚠️  WARNING: You are about to delete the following admin account:`);
    console.log(`   ID: ${admin.id}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`\n⚠️  This action cannot be undone!`);
    console.log(`\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...`);

    // Wait 5 seconds before deletion
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Delete admin
    await pool.query("DELETE FROM users WHERE id = $1", [admin.id]);

    console.log(`\n✅ Admin account deleted successfully!`);
    console.log(`   Deleted: ${admin.email}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error deleting admin:", error.message);
    process.exit(1);
  }
}

deleteAdmin();

