#!/bin/bash
# Secret detection helper for development.
# Scans staged files for common patterns that look like API keys or credentials.
# Usage: ./scripts/check-secrets.sh
# Or: npm run check-secrets (if added to package.json scripts)

set -e

echo "🔍 Scanning for potential secrets in staged files..."

# Files to check (staged only)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")

if [ -z "$STAGED_FILES" ]; then
  echo "✅ No staged files to check."
  exit 0
fi

# Patterns to detect (high-confidence indicators)
PATTERNS=(
  "GEMINI_API_KEY=[^$]"           # Non-empty GEMINI key
  "AI_ML_API_KEY=[^$]"            # Non-empty AI/ML key
  "Authorization: Bearer [a-z0-9]" # Bearer tokens
  "_api_key['\"].*['\"]"           # Generic API key patterns
  "secret['\"].*['\"]"             # Secret values
)

FOUND=0

for PATTERN in "${PATTERNS[@]}"; do
  MATCHES=$(git diff --cached $STAGED_FILES | grep -E "$PATTERN" || true)
  if [ ! -z "$MATCHES" ]; then
    echo "⚠️  Potential secret found matching: $PATTERN"
    echo "$MATCHES" | head -5
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo ""
  echo "❌ Secrets detected! Before committing:"
  echo "   1. Review the matches above"
  echo "   2. Remove or redact sensitive values"
  echo "   3. Use placeholders instead (see .env.local.example)"
  echo "   4. Run: git reset HEAD <file> to unstage"
  echo "   5. Edit: .env.local or the file to remove secrets"
  echo "   6. Run: git add <file> again"
  exit 1
else
  echo "✅ No obvious secrets detected."
  exit 0
fi
