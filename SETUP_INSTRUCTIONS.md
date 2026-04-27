# Complete Database Setup Instructions

## ⚠️ IMPORTANT: Run these steps in order

### Step 1: Create the Database

**Option A: Using pgAdmin (Recommended)**
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click "Databases" → "Create" → "Database"
4. Name: `inclass` (or match your DATABASE_URL)
5. Click "Save"

**Option B: Using Command Line**
```bash
cd InClass/backend
node scripts/create-database.js
```

### Step 2: Run the Schema

**Option A: Using pgAdmin (Recommended - Easiest)**
1. In pgAdmin, right-click your `inclass` database
2. Select "Query Tool"
3. Click "Open File" (or press Ctrl+O)
4. Navigate to `InClass/backend/schema.sql`
5. Click "Execute" (F5) or click the Execute button
6. Wait for "Query returned successfully"

**Option B: Using Node.js Script**
```bash
cd InClass/backend
node scripts/setup-schema.js
```

**Option C: Using psql (if installed)**
```bash
psql -U postgres -d inclass -f InClass/backend/schema.sql
```

### Step 3: Verify Setup

```bash
cd InClass/backend
node scripts/verify-database.js
```

You should see all tables marked with ✅

### Step 4: Start Your Backend Server

```bash
cd InClass/backend
npm start
```

## Troubleshooting

### Error: "database does not exist"
- Make sure you ran Step 1 (create database)
- Check your `.env` file has the correct DATABASE_URL

### Error: "relation does not exist"
- Make sure you ran Step 2 (run schema)
- Check the schema.sql executed without errors

### Error: "column does not exist"
- The schema might have execution order issues
- **Solution**: Use pgAdmin Query Tool (Option A in Step 2) - it handles this better

### Error: "password authentication failed"
- Check your `.env` file has correct DB_USER and DB_PASSWORD
- Make sure PostgreSQL is running

## Environment Variables (.env file)

Make sure your `InClass/backend/.env` has:

```env
# Database Connection (choose one format)

# Format 1: Full connection string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inclass

# Format 2: Individual variables
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=inclass

# JWT Secret (required for authentication)
JWT_SECRET=your-secret-key-here-change-in-production
```

## Quick Test

After setup, test the registration:
1. Start backend: `cd InClass/backend && npm start`
2. Start frontend: `cd InClass/frontend && npm run dev`
3. Go to registration page
4. Try registering a user
5. Check that colleges and departments dropdowns work

