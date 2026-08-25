#!/usr/bin/env bash
# local-services/stop: stop all local development services
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Stopping Local Services ==="

echo "  Stopping backend services (uvicorn)..."
pkill -f "uvicorn.*app.main:app" 2>/dev/null || true
pkill -f "uvicorn.*src.rag_service.main:app" 2>/dev/null || true

echo "  Stopping frontend services (vite)..."
pkill -f "vite" 2>/dev/null || true

echo "  Stopping workers (celery)..."
pkill -f "celery" 2>/dev/null || true

echo ""

# Check if user wants to stop infra too
if [ "${1:-}" = "--all" ]; then
  echo "  Stopping infrastructure (Docker)..."
  make infra-down 2>&1 | grep -v '^\[' || true
  echo ""
  echo "✓ Everything stopped (including infrastructure)"
else
  echo "✓ Services stopped (infrastructure still running)"
  echo "  To stop infrastructure too: bash $0 --all"
fi
