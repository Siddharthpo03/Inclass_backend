# Database Setup Guide

## Quick Setup (Recommended)

### Step 1: Create the Database
```bash
cd InClass/backend
node scripts/create-database.js
```

### Step 2: Run the Schema
```bash
node scripts/setup-schema.js
```

## Manual Setup (Using pgAdmin)

### Step 1: Create Database
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click on "Databases" → "Create" → "Database"
4. Name: `inclass` (or match your DATABASE_URL)
5. Click "Save"

### Step 2: Run Schema
1. Right-click on your `inclass` database → "Query Tool"
2. Open `schema.sql` file
3. Copy entire contents
4. Paste into Query Tool
5. Execute (F5)

## Environment Variables

Make sure your `.env` file has:

```env
# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inclass

# OR use individual variables:
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=inclass
```

## Verify Setup

After setup, verify tables exist:
```bash
node scripts/verify-database.js
```

## Troubleshooting

### Error: "database does not exist"
- Run `node scripts/create-database.js` first
- Check your DATABASE_URL in .env matches the database name

### Error: "relation does not exist"
- Run `node scripts/setup-schema.js`
- Or manually run schema.sql in pgAdmin

### Error: "password authentication failed"
- Check DB_USER and DB_PASSWORD in .env
- Verify PostgreSQL is running

