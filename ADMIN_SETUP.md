# Admin Account Setup Guide

## ⚠️ Important: Admin accounts can ONLY be created from the backend

Admin accounts **cannot** be created through the frontend. This is a security measure to prevent unauthorized admin account creation.

## How to Create an Admin Account

### Method: Using the Backend Script (Recommended)

Use the existing `createAdmin.js` script to create admin accounts:

```bash
cd backend
node scripts/createAdmin.js "Admin Name" "admin@example.com" "SecurePassword123" "ADM001"
```

**Parameters:**
- `Admin Name` - Full name of the admin
- `admin@example.com` - Email address (must be unique)
- `SecurePassword123` - Password (minimum 6 characters)
- `ADM001` - (Optional) Roll number/ID for the admin

**Example:**
```bash
node scripts/createAdmin.js "John Admin" "admin@inclass.com" "MySecurePass123" "ADM001"
```

**Output:**
```
✅ Admin account created successfully!

📋 Admin Details:
   ID: 1
   Name: John Admin
   Email: admin@inclass.com
   Role: admin
   Roll No: ADM001
   Created At: 2024-01-15 10:30:00

🔐 Login Credentials:
   Email: admin@inclass.com
   Password: MySecurePass123

⚠️  Please save these credentials securely!

💡 The admin can now login at the frontend using this email.
   The system will automatically detect it's an admin account.
```

## Admin Management Scripts

### List All Admins

```bash
node scripts/listAdmins.js
```

This will show all admin accounts in the database with their details.

### Delete an Admin

```bash
node scripts/deleteAdmin.js "admin@example.com"
```

⚠️ **Warning:** This will permanently delete the admin account. The script will wait 5 seconds before deletion to give you time to cancel (Ctrl+C).

## Admin Login

After creating an admin account, the admin can log in at:

**Frontend URL:**
```
http://localhost:5173/inclass/admin/login
```

Or in production:
```
https://yourdomain.com/inclass/admin/login
```

## Security Notes

- **Backend Only**: Admin accounts can only be created from the backend using the script. This prevents unauthorized access.
- **Strong Passwords**: Always use strong, unique passwords for admin accounts.
- **First Admin**: Create your first admin account using the script, then use the admin dashboard to manage the system.
- **Access Control**: Only trusted personnel should have access to run the admin creation script.

## Troubleshooting

- **"Email already exists"**: The email is already registered. Use a different email or check existing admins with `listAdmins.js`.
- **"Password must be at least 6 characters"**: Use a password with at least 6 characters.
- **"Invalid email format"**: Ensure the email follows standard format (e.g., user@example.com).
- **Database connection error**: Make sure your database is running and `.env` file is configured correctly.

## Environment Setup

Make sure your `.env` file has the database connection configured:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inclass
DB_USER=your_db_user
DB_PASSWORD=your_db_password
```

## Next Steps

1. Create your first admin account using the script
2. Log in at `/inclass/admin/login`
3. Access the admin dashboard to manage the system
4. Use the dashboard to manage users, fingerprint assists, and view audit logs
