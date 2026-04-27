// Test script to verify admin account exists and login works
// Usage: node scripts/testAdminLogin.js "admin@example.com"

const pool = require("../db");
const bcrypt = require("bcrypt");
require("dotenv").config();

async function testAdminLogin() {
  const args = process.argv.slice(2);
  const email = args[0] || "admin@example.com";

  console.log("\n🔍 Testing Admin Login System...\n");
  console.log(`Email to test: ${email}\n`);

  try {
    // Step 1: Check if any admin accounts exist
    console.log("Step 1: Checking for admin accounts in database...");
    const allAdmins = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE role = 'admin'"
    );
    
    console.log(`   Found ${allAdmins.rowCount} admin account(s) in database:`);
    if (allAdmins.rowCount > 0) {
      allAdmins.rows.forEach((admin, index) => {
        console.log(`   ${index + 1}. ID: ${admin.id}, Email: ${admin.email}, Name: ${admin.name}`);
      });
    } else {
      console.log("   ⚠️  No admin accounts found in database!");
      console.log("   💡 Create an admin using: node scripts/createAdmin.js 'Name' 'email@example.com' 'password'");
      process.exit(1);
    }

    // Step 2: Check if the specific email exists
    console.log(`\nStep 2: Checking if email '${email}' exists...`);
    const emailCheck = await pool.query(
      "SELECT id, name, email, role FROM users WHERE email = $1",
      [email]
    );

    if (emailCheck.rowCount === 0) {
      console.log(`   ❌ Email '${email}' not found in database`);
      console.log(`   💡 Available admin emails:`);
      allAdmins.rows.forEach((admin) => {
        console.log(`      - ${admin.email}`);
      });
      process.exit(1);
    }

    const user = emailCheck.rows[0];
    console.log(`   ✅ Email found: ${user.email}`);
    console.log(`   Role: ${user.role}`);

    // Step 3: Check if it's an admin
    console.log(`\nStep 3: Verifying admin role...`);
    if (user.role !== "admin") {
      console.log(`   ❌ User exists but role is '${user.role}', not 'admin'`);
      console.log(`   💡 This email cannot be used for admin login`);
      process.exit(1);
    }
    console.log(`   ✅ Role is 'admin'`);

    // Step 4: Test the exact query used in login
    console.log(`\nStep 4: Testing admin login query...`);
    const loginQuery = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = 'admin'",
      [email]
    );

    if (loginQuery.rowCount === 0) {
      console.log(`   ❌ Login query returned 0 results (this is the problem!)`);
      console.log(`   💡 This means the query is failing even though admin exists`);
      process.exit(1);
    }
    console.log(`   ✅ Login query successful - found admin account`);
    console.log(`   Admin ID: ${loginQuery.rows[0].id}`);
    console.log(`   Admin Name: ${loginQuery.rows[0].name}`);

    // Step 5: Check password hash
    console.log(`\nStep 5: Checking password hash...`);
    const adminUser = loginQuery.rows[0];
    if (!adminUser.password) {
      console.log(`   ❌ No password hash found for admin account`);
      process.exit(1);
    }
    console.log(`   ✅ Password hash exists (${adminUser.password.substring(0, 20)}...)`);

    console.log(`\n✅ All checks passed! Admin account is valid and ready for login.`);
    console.log(`\n💡 Try logging in with:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: [the password used when creating the admin]`);
    console.log(`   URL: http://localhost:5173/inclass/admin/login\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during testing:", error.message);
    console.error(error);
    process.exit(1);
  }
}

testAdminLogin();









