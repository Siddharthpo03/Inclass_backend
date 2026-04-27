#!/usr/bin/env node
/**
 * P3 - Validate that no secrets are hardcoded in source code.
 * Run: node scripts/validate-no-hardcoded-secrets.js
 * Exit code 0 = OK, 1 = possible hardcoded secret found.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Patterns that indicate a possible hardcoded secret (assignment to a quoted string)
// Excludes safe defaults like "localhost", "postgres", short strings
const DANGEROUS_PATTERNS = [
  { name: "JWT_SECRET", regex: /JWT_SECRET\s*=\s*["'][^"']{8,}["']/ },
  { name: "BIOMETRIC_ENCRYPTION_KEY", regex: /BIOMETRIC_ENCRYPTION_KEY\s*=\s*["'][^"']{8,}["']/ },
  { name: "ADMIN_SECRET", regex: /ADMIN_SECRET\s*=\s*["'][^"']+["']/ },
  { name: "DATABASE_URL with credentials", regex: /DATABASE_URL\s*=\s*["'][^"']*:\/\/[^"']+["']/ },
  // Only flag fallbacks that look like secrets (long or contain secret-like names)
  { name: "process.env secret fallback", regex: /process\.env\.(JWT_SECRET|BIOMETRIC_ENCRYPTION_KEY|ADMIN_SECRET|DATABASE_URL|EMAIL_PASS|AUTH_TOKEN|PASSWORD)\s*\|\|\s*["'][^"']+["']/ },
];

const SKIP_FILES = [".env.example", "validate-no-hardcoded-secrets.js", "ENV_SECURITY.md"];
const SKIP_DIRS = ["node_modules", ".git", "dist", "build"];

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.includes(e.name)) walkDir(full, callback);
    } else if (e.isFile() && /\.(js|ts|jsx|tsx|cjs|mjs)$/.test(e.name) && !SKIP_FILES.includes(e.name)) {
      callback(full);
    }
  }
}

let found = [];
walkDir(ROOT, (file) => {
  const content = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  for (const { name, regex } of DANGEROUS_PATTERNS) {
    const match = content.match(regex);
    if (match) {
      found.push({ file: rel, pattern: name, snippet: match[0].slice(0, 60) + "..." });
    }
  }
});

if (found.length > 0) {
  console.error("❌ P3 validation failed: possible hardcoded secrets found:\n");
  found.forEach(({ file, pattern, snippet }) => {
    console.error(`   ${file}: ${pattern}`);
    console.error(`   snippet: ${snippet}\n`);
  });
  process.exit(1);
}

console.log("✅ P3: No hardcoded secrets detected in backend code.");
process.exit(0);
