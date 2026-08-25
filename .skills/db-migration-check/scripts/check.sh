#!/usr/bin/env bash
# db-migration-check: verify model changes have corresponding migrations
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached)
if [ -z "$CHANGED_FILES" ]; then
  echo "✓ No changes detected"
  exit 0
fi

# Find model file changes
MODEL_CHANGES=$(echo "$CHANGED_FILES" | grep -E 'models/.*\.py$' || true)

if [ -z "$MODEL_CHANGES" ]; then
  echo "✓ No model changes detected"
  exit 0
fi

echo "Model changes detected:"
echo "$MODEL_CHANGES" | sed 's/^/  /'
echo ""

# Find migration file changes
MIGRATION_CHANGES=$(echo "$CHANGED_FILES" | grep -E '(alembic|migrations)/versions/.*\.py$' || true)

# Extract services with model changes
MODEL_SERVICES=$(echo "$MODEL_CHANGES" | grep '^repos/' | cut -d'/' -f2 | sort -u)

MISSING=0
for SERVICE in $MODEL_SERVICES; do
  HAS_MIGRATION=$(echo "$MIGRATION_CHANGES" | grep "$SERVICE" || true)
  if [ -z "$HAS_MIGRATION" ]; then
    echo "✗ $SERVICE: model changes found but NO migration file"
    MISSING=1
  else
    echo "✓ $SERVICE: model changes with migration"
  fi
done

echo ""
if [ "$MISSING" -eq 1 ]; then
  echo "✗ FAILED: Some services have model changes without migrations"
  echo "  Run: cd repos/<service> && poetry run alembic revision --autogenerate -m 'description'"
  exit 1
else
  echo "✓ All model changes have corresponding migrations"
fi
