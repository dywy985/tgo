#!/bin/bash
# Demo script for domain configuration functionality
# Usage: ./scripts/demo-domain-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TGO Domain Configuration Demo${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Clean up previous configuration
echo -e "${YELLOW}[1/5] Cleaning up previous configuration...${NC}"
rm -rf "$PROJECT_ROOT/data/.tgo-domain-config"* "$PROJECT_ROOT/data/nginx"
echo -e "${GREEN}✓ Cleaned${NC}"
echo ""

# Configure domains
echo -e "${YELLOW}[2/5] Configuring domains...${NC}"
cd "$PROJECT_ROOT"
./tgo.sh config web_domain www.example.com
./tgo.sh config widget_domain widget.example.com
./tgo.sh config api_domain api.example.com
echo -e "${GREEN}✓ Domains configured${NC}"
echo ""

# Configure SSL
echo -e "${YELLOW}[3/5] Configuring SSL...${NC}"
./tgo.sh config ssl_mode none
./tgo.sh config ssl_email admin@example.com
echo -e "${GREEN}✓ SSL configured${NC}"
echo ""

# Show configuration
echo -e "${YELLOW}[4/5] Current configuration:${NC}"
./tgo.sh config show
echo ""

# Show generated Nginx config
echo -e "${YELLOW}[5/5] Generated Nginx configuration:${NC}"
echo -e "${BLUE}========================================${NC}"
head -60 "$PROJECT_ROOT/data/nginx/conf.d/default.conf"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${GREEN}✓ Demo completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Configure DNS records:"
echo "   www.example.com      A    <your-server-ip>"
echo "   widget.example.com   A    <your-server-ip>"
echo "   api.example.com      A    <your-server-ip>"
echo ""
echo "2. Start services:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.nginx.yml up -d"
echo ""
echo "3. Verify:"
echo "   curl http://www.example.com"
echo ""

