#!/bin/bash
# Test domain configuration functionality
# Usage: ./scripts/test-domain-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
  local test_name="$1"
  local test_cmd="$2"

  echo -n "Testing: $test_name... "

  if eval "$test_cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC}"
    ((TESTS_FAILED++))
    return 1
  fi
}

echo "=========================================="
echo "Domain Configuration Tests"
echo "=========================================="
echo ""

# Test 1: Check if tgo.sh exists
run_test "tgo.sh exists" "[ -f '$PROJECT_ROOT/tgo.sh' ]"

# Test 2: Check if config command is available
run_test "config command available" "grep -q 'cmd_config' '$PROJECT_ROOT/tgo.sh'"

# Test 3: Check if scripts exist
run_test "generate-nginx-config.sh exists" "[ -f '$PROJECT_ROOT/scripts/generate-nginx-config.sh' ]"
run_test "setup-ssl.sh exists" "[ -f '$PROJECT_ROOT/scripts/setup-ssl.sh' ]"
run_test "renew-ssl.sh exists" "[ -f '$PROJECT_ROOT/scripts/renew-ssl.sh' ]"

# Test 4: Check if scripts are executable
run_test "generate-nginx-config.sh is executable" "[ -x '$PROJECT_ROOT/scripts/generate-nginx-config.sh' ]"
run_test "setup-ssl.sh is executable" "[ -x '$PROJECT_ROOT/scripts/setup-ssl.sh' ]"
run_test "renew-ssl.sh is executable" "[ -x '$PROJECT_ROOT/scripts/renew-ssl.sh' ]"

# Test 5: Check if docker-compose files exist
run_test "docker-compose.nginx.yml exists" "[ -f '$PROJECT_ROOT/docker-compose.nginx.yml' ]"

# Test 6: Check if documentation exists
run_test "DOMAIN_CONFIG_GUIDE.md exists" "[ -f '$PROJECT_ROOT/docs/DOMAIN_CONFIG_GUIDE.md' ]"
run_test "SSL_AUTO_RENEWAL_SETUP.md exists" "[ -f '$PROJECT_ROOT/docs/SSL_AUTO_RENEWAL_SETUP.md' ]"
run_test "DOMAIN_CONFIG_QUICK_REFERENCE.md exists" "[ -f '$PROJECT_ROOT/docs/DOMAIN_CONFIG_QUICK_REFERENCE.md' ]"

# Test 7: Check if .env.example has domain config
run_test ".env.example has WEB_DOMAIN" "grep -q 'WEB_DOMAIN' '$PROJECT_ROOT/.env.example'"
run_test ".env.example has WIDGET_DOMAIN" "grep -q 'WIDGET_DOMAIN' '$PROJECT_ROOT/.env.example'"
run_test ".env.example has API_DOMAIN" "grep -q 'API_DOMAIN' '$PROJECT_ROOT/.env.example'"
run_test ".env.example has SSL_MODE" "grep -q 'SSL_MODE' '$PROJECT_ROOT/.env.example'"

# Test 8: Check if helper functions exist in tgo.sh
run_test "ensure_domain_config function exists" "grep -q 'ensure_domain_config()' '$PROJECT_ROOT/tgo.sh'"
run_test "copy_manual_cert function exists" "grep -q 'copy_manual_cert()' '$PROJECT_ROOT/tgo.sh'"
run_test "regenerate_nginx_config function exists" "grep -q 'regenerate_nginx_config()' '$PROJECT_ROOT/tgo.sh'"

# Test 9: Check docker-compose.nginx.yml content
run_test "docker-compose.nginx.yml has nginx service" "grep -q 'nginx:' '$PROJECT_ROOT/docker-compose.nginx.yml'"
run_test "docker-compose.nginx.yml has certbot service" "grep -q 'certbot:' '$PROJECT_ROOT/docker-compose.nginx.yml'"

# Test 10: Check generate-nginx-config.sh content
run_test "generate-nginx-config.sh has HTTP block" "grep -q 'listen 80' '$PROJECT_ROOT/scripts/generate-nginx-config.sh'"
run_test "generate-nginx-config.sh has HTTPS block" "grep -q 'listen 443 ssl' '$PROJECT_ROOT/scripts/generate-nginx-config.sh'"

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi

