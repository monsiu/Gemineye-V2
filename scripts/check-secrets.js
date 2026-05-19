#!/usr/bin/env node

/**
 * Secret detection helper for development (cross-platform).
 * Scans staged files for common patterns that look like API keys or credentials.
 * Usage: node scripts/check-secrets.js
 * Or: npm run check-secrets (if configured in package.json)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Scanning for potential secrets in staged files...\n');

// Get staged files
let stagedFiles = '';
try {
  stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch {
  // git diff failed, exit gracefully
  console.log('✅ No staged files to check.');
  process.exit(0);
}

if (!stagedFiles) {
  console.log('✅ No staged files to check.');
  process.exit(0);
}

// Patterns to detect (high-confidence indicators)
const patterns = [
  { pattern: /GEMINI_API_KEY\s*=\s*[a-zA-Z0-9_\-]{10,}/, name: 'GEMINI API Key' },
  { pattern: /AI_ML_API_KEY\s*=\s*[a-zA-Z0-9_\-]{10,}/, name: 'AI/ML API Key' },
  { pattern: /Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.]+/, name: 'Bearer Token' },
  { pattern: /_api_key\s*[=:]\s*["'][a-zA-Z0-9_\-\.]+["']/, name: 'Generic API Key' },
  { pattern: /secret\s*[=:]\s*["'][^\s"']+["']/, name: 'Secret Pattern' },
  { pattern: /GEMINI_API_KEY\s*=\s*(?!your_|insert_|example_)/, name: 'Non-placeholder GEMINI Key' },
  { pattern: /AI_ML_API_KEY\s*=\s*(?!your_|insert_|example_)/, name: 'Non-placeholder AI/ML Key' },
];

let found = 0;

// Get the diff of staged files
try {
  const diff = execSync('git diff --cached', { encoding: 'utf-8' }).split('\n');

  for (const { pattern, name } of patterns) {
    const matches = diff.filter((line) => pattern.test(line));
    if (matches.length > 0) {
      console.log(`⚠️  Potential secret found: ${name}`);
      console.log(`   Examples: ${matches.slice(0, 3).join('\n   ')}\n`);
      found = 1;
    }
  }
} catch (error) {
  console.error('Error scanning diff:', error.message);
}

if (found === 1) {
  console.log('❌ Secrets detected! Before committing:\n');
  console.log('   1. Review the matches above');
  console.log('   2. Remove or redact sensitive values');
  console.log('   3. Use placeholders instead (see .env.local.example)');
  console.log('   4. Run: git reset HEAD <file> to unstage');
  console.log('   5. Edit: .env.local or the file to remove secrets');
  console.log('   6. Run: git add <file> again\n');
  process.exit(1);
} else {
  console.log('✅ No obvious secrets detected.\n');
  process.exit(0);
}
