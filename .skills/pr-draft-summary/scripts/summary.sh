#!/usr/bin/env bash
# pr-draft-summary: generate PR change summary grouped by service
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

# Detect base branch
BASE_BRANCH="main"
if ! git rev-parse --verify "$BASE_BRANCH" &>/dev/null; then
  BASE_BRANCH="master"
fi

# Get changed files vs base
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD 2>/dev/null || git diff --name-only HEAD)

if [ -z "$CHANGED_FILES" ]; then
  echo "No changes to summarize."
  exit 0
fi

# Get recent commits
COMMITS=$(git log --oneline "$BASE_BRANCH"...HEAD 2>/dev/null || git log --oneline -10)

echo "## Changes"
echo ""

# Group by top-level directory
GROUPS=$(echo "$CHANGED_FILES" | cut -d'/' -f1-2 | sort -u)

for GROUP in $GROUPS; do
  FILES_IN_GROUP=$(echo "$CHANGED_FILES" | grep "^$GROUP/" || echo "$CHANGED_FILES" | grep "^$GROUP$" || true)
  COUNT=$(echo "$FILES_IN_GROUP" | grep -c . || echo 0)

  echo "### $GROUP ($COUNT files)"
  echo "$FILES_IN_GROUP" | head -20 | sed 's/^/- /'
  if [ "$COUNT" -gt 20 ]; then
    echo "- ... and $((COUNT - 20)) more"
  fi
  echo ""
done

echo "## Commits"
echo ""
echo "$COMMITS" | head -20 | sed 's/^/- /'
echo ""

# Stats
echo "## Stats"
STAT=$(git diff --stat "$BASE_BRANCH"...HEAD 2>/dev/null | tail -1 || git diff --stat HEAD | tail -1)
echo "$STAT"
