# SEC-007: SQL Injection Risk Review

**Status:** ✅ Resolved  
**Date:** 2026-02-16  
**Scope:** Full backend; PostgreSQL (pg)

---

## Summary

- All application SQL uses **parameterized queries** (`$1`, `$2`, …) with the `pg` library.
- The only non-parameterized SQL was **CREATE DATABASE** in setup scripts; database name is now **sanitized** (alphanumeric + underscore only) and the identifier is safely quoted.
- **SECURE** comments were added at critical query sites (login, registration, attendance, admin, biometrics, faculty, reports, registrations, middleware).

---

## Changes Made

### 1. CREATE DATABASE (injection risk fixed)

**Files:** `scripts/create-database.js`, `scripts/setup-complete.js`

- **Risk:** `CREATE DATABASE ${dbName}` with unsanitized `dbName` from env (e.g. DATABASE_URL path).
- **Fix:**
  - Sanitize: allow only `[a-zA-Z0-9_]`; reject otherwise.
  - Use parameterized query for **check**: `SELECT 1 FROM pg_database WHERE datname = $1`, `[dbName]`.
  - For **CREATE DATABASE** (no `$1` in PostgreSQL): use sanitized `dbName` and quote the identifier: `"CREATE DATABASE \"" + dbName.replace(/"/g, '""') + "\""`.

### 2. Application queries (already safe; comments added)

All route and middleware queries already used parameterized queries. **SECURE** comments were added at representative spots:

| File | Area | Comment added |
|------|------|----------------|
| `routes/auth.js` | check-email, profile, login, colleges, departments | SECURE: Parameterized query prevents SQL injection |
| `routes/attendance.js` | session lookup by code | SECURE: Parameterized query prevents SQL injection |
| `routes/admin.js` | admin login email check | SECURE: Parameterized query prevents SQL injection (admin login) |
| `routes/biometrics.js` | webauthn user lookup | SECURE: Parameterized query prevents SQL injection (biometric/webauthn) |
| `routes/faculty.js` | /me, list (dynamic query) | SECURE: Parameterized query (params array) prevents SQL injection |
| `routes/reports.js` | expired-code session check | SECURE: Parameterized query prevents SQL injection |
| `routes/registrations.js` | course lookup | SECURE: Parameterized query prevents SQL injection |
| `middleware/biometricAuth.js` | face_encodings lookup | SECURE: Parameterized query prevents SQL injection |
| `index.js` | DB connection check | SECURE: No user input; connection check only |

---

## Protection Coverage

- **Login:** ✅ `email` and all inputs via `$1`, `$2`.
- **Registration:** ✅ All user inputs in INSERT/SELECT via parameters.
- **Attendance marking:** ✅ `code`, `student_id`, session id, etc. via parameters.
- **Admin:** ✅ Email and id via parameters.
- **Biometric storage:** ✅ User id, credentials, face data via parameters.
- **Faculty/list:** ✅ Dynamic WHERE built with `$1`, `$2` and `params` array.
- **Colleges/departments search:** ✅ Search term passed as `$1` in params.

---

## Safe Patterns Used

1. **Static + params:** `pool.query("SELECT * FROM users WHERE email = $1", [email])`
2. **Dynamic WHERE, params array:**  
   `query += " AND u.college_id = $1"; params.push(collegeIdInt);`  
   then `pool.query(query, params)` (no user input in the query string).
3. **Search (ILIKE):** Search term in params: `params.push('%' + search.trim() + '%')`, never concatenated into SQL.

---

## Recommendation

- Keep using **only** parameterized queries for all user- or request-derived data.
- For any future DDL (e.g. identifiers), **validate/sanitize** (whitelist) and **quote** identifiers; do not interpolate raw input into SQL.
