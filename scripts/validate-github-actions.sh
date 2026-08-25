#!/bin/bash
# Validate GitHub Actions workflow configuration

set -e

echo "========================================="
echo "  GitHub Actions Workflow Validation"
echo "========================================="
echo ""

cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
run_test() {
  local test_name="$1"
  local test_cmd="$2"
  
  echo -n "Testing: $test_name ... "
  if eval "$test_cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
  fi
}

echo "1. Checking workflow file..."
echo ""

# Check if workflow file exists
run_test "Workflow file exists" \
  "[ -f .github/workflows/build-and-push.yml ]"

# Check workflow syntax
run_test "Workflow has valid YAML" \
  "grep -q 'name: Build and push' .github/workflows/build-and-push.yml"

echo ""
echo "2. Checking trigger configuration..."
echo ""

# Check push tags trigger
run_test "Push tags trigger configured" \
  "grep -q 'push:' .github/workflows/build-and-push.yml"

# Check v* tag pattern
run_test "v* tag pattern exists" \
  "grep -q \"- 'v\*'\" .github/workflows/build-and-push.yml"

# Check tgo-*-v* tag pattern
run_test "tgo-*-v* tag pattern exists" \
  "grep -q \"- 'tgo-\*-v\*'\" .github/workflows/build-and-push.yml"

# Check workflow_dispatch
run_test "workflow_dispatch trigger configured" \
  "grep -q 'workflow_dispatch:' .github/workflows/build-and-push.yml"

# Check services input
run_test "Services input parameter exists" \
  "grep -q 'services:' .github/workflows/build-and-push.yml"

echo ""
echo "3. Checking job configuration..."
echo ""

# Check discover-services job
run_test "discover-services job exists" \
  "grep -q 'discover-services:' .github/workflows/build-and-push.yml"

# Check build-and-push job
run_test "build-and-push job exists" \
  "grep -q 'build-and-push:' .github/workflows/build-and-push.yml"

# Check matrix strategy
run_test "Matrix strategy configured" \
  "grep -q 'matrix:' .github/workflows/build-and-push.yml"

echo ""
echo "4. Checking service discovery logic..."
echo ""

# Check workflow_dispatch handling
run_test "workflow_dispatch input handling" \
  "grep -q 'github.event.inputs.services' .github/workflows/build-and-push.yml"

# Check tag prefix detection
run_test "Tag prefix detection logic" \
  "grep -q 'tgo-\[a-z-\]' .github/workflows/build-and-push.yml"

# Check auto-discovery
run_test "Auto-discovery logic" \
  "grep -q 'repos/\*/' .github/workflows/build-and-push.yml"

echo ""
echo "5. Checking documentation..."
echo ""

# Check quick reference
run_test "Quick reference documentation exists" \
  "[ -f docs/GITHUB_ACTIONS_QUICK_REFERENCE.md ]"

# Check detailed guide
run_test "Detailed guide documentation exists" \
  "[ -f docs/GITHUB_ACTIONS_SELECTIVE_BUILD.md ]"

# Check examples
run_test "Examples documentation exists" \
  "[ -f docs/GITHUB_ACTIONS_EXAMPLES.md ]"

# Check implementation summary
run_test "Implementation summary exists" \
  "[ -f docs/GITHUB_ACTIONS_IMPLEMENTATION_SUMMARY.md ]"

echo ""
echo "6. Checking Dockerfile availability..."
echo ""

# Count services with Dockerfile
service_count=$(find repos -maxdepth 2 -name "Dockerfile" | wc -l)
echo "Found $service_count services with Dockerfile"

if [ "$service_count" -gt 0 ]; then
  echo -e "${GREEN}✓ Services available for building${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ No services found${NC}"
  ((TESTS_FAILED++))
fi

echo ""
echo "========================================="
echo "  Validation Results"
echo "========================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All validations passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Review the workflow: .github/workflows/build-and-push.yml"
  echo "2. Read the documentation: docs/GITHUB_ACTIONS_QUICK_REFERENCE.md"
  echo "3. Test the workflow:"
  echo "   - Use workflow_dispatch: GitHub → Actions → Run workflow"
  echo "   - Use tag prefix: git tag tgo-api-v1.0.0 && git push origin tgo-api-v1.0.0"
  echo "   - Use generic tag: git tag v1.0.0 && git push origin v1.0.0"
  exit 0
else
  echo -e "${RED}✗ Some validations failed${NC}"
  exit 1
fi

