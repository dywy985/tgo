#!/usr/bin/env bash
# Build script to generate bootstrap.sh and bootstrap_cn.sh from bootstrap.sh template
# This reduces code duplication by maintaining a single source of truth

set -euo pipefail

echo "=== Building Bootstrap Scripts ==="

# Read the original bootstrap.sh as the template
if [ ! -f "bootstrap.sh" ]; then
  echo "[ERROR] bootstrap.sh not found!" >&2
  exit 1
fi

# Generate bootstrap_cn.sh by modifying specific lines
echo "[INFO] Generating bootstrap_cn.sh from bootstrap.sh..."

# Use sed to make the necessary replacements
sed -e 's|^# Bootstrap script for one-command TGO deployment$|# Bootstrap script for one-command TGO deployment (China Network Optimized)\n#\n# This is the China-optimized version of bootstrap.sh that uses Gitee mirrors\n# for faster Git repository cloning in mainland China.\n#\n# Differences from bootstrap.sh:\n# - Uses Gitee (https://gitee.com) instead of GitHub for repository cloning\n# - All other functionality remains identical\n#\n# Note: After deployment, use '\''./tgo.sh install --cn'\'' to pull Docker images\n# from Alibaba Cloud Container Registry for faster downloads in China.|' \
    -e 's|^# Usage (remote):  curl -fsSL https://your.host/bootstrap.sh \| bash$|# Usage (remote):  curl -fsSL https://your.host/bootstrap_cn.sh \| bash|' \
    -e 's|^# Usage (local):   bash bootstrap.sh$|# Usage (local):   bash bootstrap_cn.sh|' \
    -e 's|^REPO="${REPO:-https://github.com/tgoai/tgo.git}"$|REPO="${REPO:-https://gitee.com/tgoai/tgo.git}"|' \
    -e 's|\./tgo\.sh install\.\.\.|\./tgo.sh install --cn...|g' \
    -e 's|\./tgo\.sh install"|\./tgo.sh install --cn"|g' \
    -e 's|\./tgo\.sh install)|\./tgo.sh install --cn)|g' \
    -e 's|\./tgo\.sh install$|\./tgo.sh install --cn|g' \
    bootstrap.sh > bootstrap_cn.sh

chmod +x bootstrap_cn.sh

echo "[INFO] Generated bootstrap_cn.sh ($(wc -l < bootstrap_cn.sh) lines)"
echo "[INFO] Setting executable permissions..."
chmod +x bootstrap.sh bootstrap_cn.sh

echo ""
echo "=== Build Complete ==="
echo "Generated files:"
echo "  - bootstrap.sh ($(wc -l < bootstrap.sh) lines)"
echo "  - bootstrap_cn.sh ($(wc -l < bootstrap_cn.sh) lines)"
echo ""
echo "Differences:"
diff_count=$(diff bootstrap.sh bootstrap_cn.sh | grep -c '^[<>]' || echo "0")
echo "  - $diff_count lines different"
echo ""
echo "Key changes in bootstrap_cn.sh:"
echo "  ✓ Repository: GitHub → Gitee"
echo "  ✓ Install command: ./tgo.sh install → ./tgo.sh install --cn"
echo "  ✓ Added China optimization header comments"
