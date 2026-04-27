# Environment Variables & Secrets Security

This document explains how to keep secrets out of the repository, fix accidental exposure, and run securely in production (Railway, VPS, etc.).

**P3 – Env security:** `.gitignore` excludes `.env` and `.env.*` for root, backend, and frontend. Use only `.env.example` (no real values). Run `node scripts/validate-no-hardcoded-secrets.js` in backend to check for hardcoded secrets.

---

## 1. Never Commit `.env`

- **`.env`** is in `.gitignore` and must **never** be committed.
- Use **`.env.example`** only: placeholder names, no real values.
- Before first run: `cp .env.example .env` and fill in real values locally.

---

## 2. If `.env` Was Already Committed – Remove It From Git History

If `.env` (or any file with secrets) was ever committed, treat those secrets as **compromised**. Do the following.

### Step 1: Stop Using Old Secrets

- Rotate **all** secrets that were in the committed file (see Section 3).
- Do not rely on “just” removing the file from the repo.

### Step 2: Remove `.env` From the Repository (Current Tree)

```bash
# From project root
git rm --cached backend/.env
git rm --cached .env
git commit -m "chore: remove .env from repository (security)"
```

`--cached` removes the file from Git but keeps it on disk so you can keep using it locally.

### Step 3: Remove `.env` From Git History

Use one of the options below. **Warning:** These rewrite history. Coordinate with anyone who has cloned the repo; they may need to re-clone or reset.

**Option A – git filter-repo (recommended)**

```bash
# Install: pip install git-filter-repo  (or see https://github.com/newren/git-filter-repo)
git filter-repo --path backend/.env --invert-paths
git filter-repo --path .env --invert-paths
```

**Option B – BFG Repo-Cleaner**

```bash
# Download BFG from https://rtyley.github.io/bfg-repo-cleaner/
# Create a file listing paths to remove (e.g. env-files.txt):
#   backend/.env
#   .env
java -jar bfg.jar --delete-files .env
java -jar bfg.jar --delete-files .env --no-blob-protection
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

**Option C – git filter-branch (built-in)**

```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env .env" \
  --prune-empty --tag-name-filter cat -- --all
```

After any option:

- Force-push: `git push --force --all` (and `git push --force --tags` if you use tags).
- Tell the team to re-clone or follow your instructions for history rewrite.

### Step 4: Confirm

```bash
git log -p --all -S "DATABASE_URL" -- "*.env"
git log -p --all -S "JWT_SECRET" -- "*.env"
```

If these show no results, the content is no longer in history.

---

## 3. Rotate Compromised Secrets

If `.env` (or any env file) was committed or leaked:

1. **Database**
   - Change the DB user password in PostgreSQL.
   - Update `DATABASE_URL` everywhere (local and production) with the new password.

2. **JWT**
   - Generate a new secret:  
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Set new `JWT_SECRET` in local and production; restart the app. All existing JWTs will be invalid (users must log in again).

3. **Biometric key**
   - Generate a new key (same command as above).
   - Set new `BIOMETRIC_ENCRYPTION_KEY`. Existing encrypted data may need to be re-enrolled or migrated, depending on your design.

4. **Email**
   - Change the email account password (or app password) and set new `EMAIL_USER` / `EMAIL_PASS`.

5. **Other**
   - Rotate Twilio, API keys, and any other credentials that were in the committed file.

---

## 4. Secure Environment Variables in Production

### Railway

- **Dashboard:** Project → Variables.
- Add each variable (e.g. `DATABASE_URL`, `JWT_SECRET`, `BIOMETRIC_ENCRYPTION_KEY`, `FRONTEND_URL`). No `.env` file in the repo.
- Use **Railway’s** PostgreSQL or an external DB; set `DATABASE_URL` from Railway or the DB provider.
- Never commit production values; use only placeholders in `.env.example`.

### VPS (e.g. Ubuntu, Nginx, PM2)

**Option A – Environment file (not in repo)**

- On the server: `sudo nano /etc/inclass/env` (or `/opt/inclass/.env`).
- Put only `KEY=value` lines there; restrict permissions:
  ```bash
  chmod 600 /etc/inclass/env
  chown appuser:appuser /etc/inclass/env
  ```
- Load in process manager (e.g. PM2):
  ```bash
  pm2 start index.js --name inclass --env-file /etc/inclass/env
  ```
- Or in systemd: `EnvironmentFile=/etc/inclass/env`.

**Option B – Systemd environment**

- In the service file:
  ```ini
  [Service]
  Environment="DATABASE_URL=postgresql://..."
  Environment="JWT_SECRET=..."
  ```
- Restrict service file: `chmod 640 /etc/systemd/system/inclass.service`.

**Option C – Secret manager**

- Use AWS Secrets Manager, HashiCorp Vault, or your cloud’s secret manager.
- At startup, fetch secrets and set `process.env` (or write a one-off env file with strict permissions), then start the app.

### General production rules

- Use HTTPS only; set `FRONTEND_URL` and CORS to production URLs.
- Use strong, unique values for `JWT_SECRET` and `BIOMETRIC_ENCRYPTION_KEY` (e.g. 32+ byte random, hex).
- Prefer managed DB with TLS; set `DATABASE_SSL` or `PGSSLMODE=require` as needed.
- Restrict DB and app firewall rules; no secrets in logs or error messages.

---

## 5. How the Backend Uses Environment Variables

- **Entry point:** `index.js` runs `require("dotenv").config({ path: ... })` first so `.env` is loaded before any other code.
- **Required for startup:** `DATABASE_URL`, `JWT_SECRET` (length ≥ 32), `BIOMETRIC_ENCRYPTION_KEY` (length ≥ 32). In production, `FRONTEND_URL` is required.
- **Optional:** `EMAIL_*`, Twilio, WebAuthn, pool/DB options. See `.env.example`.
- All sensitive configuration is read from `process.env`; there are no default secrets in code. See `.env.example` for the list of variables.

---

## 6. Checklist

- [ ] `.env` and `backend/.env` are in `.gitignore` and never committed.
- [ ] `.env.example` has only placeholders (e.g. `your_database_url`, `your_secure_jwt_secret`).
- [ ] If `.env` was ever committed: removed from history and all listed secrets rotated.
- [ ] Production uses platform env vars or a secure env file with restricted permissions; no repo-contained production secrets.
- [ ] JWT and biometric keys are strong random values (e.g. 32+ bytes hex) and unique per environment.
