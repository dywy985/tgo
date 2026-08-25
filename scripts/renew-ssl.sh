#!/bin/bash
# Renew SSL certificates and reload Nginx
# This script should be run periodically via cron (e.g., daily or weekly)
# Usage: ./scripts/renew-ssl.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/data/.tgo-domain-config"
CERTBOT_DIR="$PROJECT_ROOT/data/certbot"
SSL_DIR="$PROJECT_ROOT/data/nginx/ssl"

# Load configuration
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[ERROR] Configuration file not found: $CONFIG_FILE"
    exit 1
fi

source "$CONFIG_FILE"

SSL_MODE=${SSL_MODE:-none}

if [ "$SSL_MODE" != "auto" ]; then
    echo "[INFO] SSL auto-renewal is not enabled (SSL_MODE=$SSL_MODE)"
    exit 0
fi

echo "[INFO] Starting SSL certificate renewal..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[ERROR] docker-compose is not available"
    exit 1
fi

# Run certbot renewal
echo "[INFO] Running certbot renewal..."
docker run --rm \
    -v "$CERTBOT_DIR/conf:/etc/letsencrypt" \
    -v "$CERTBOT_DIR/www:/var/www/certbot" \
    -v "$CERTBOT_DIR/logs:/var/log/letsencrypt" \
    certbot/certbot renew --quiet || {
    echo "[WARN] Certbot renewal encountered an issue"
}

# Copy renewed certificates to nginx ssl directory
for domain in "$WEB_DOMAIN" "$WIDGET_DOMAIN" "$API_DOMAIN"; do
    if [ -f "$CERTBOT_DIR/conf/live/$domain/fullchain.pem" ]; then
        mkdir -p "$SSL_DIR/$domain"
        cp "$CERTBOT_DIR/conf/live/$domain/fullchain.pem" "$SSL_DIR/$domain/cert.pem"
        cp "$CERTBOT_DIR/conf/live/$domain/privkey.pem" "$SSL_DIR/$domain/key.pem"
        echo "[INFO] Certificate updated for: $domain"
    fi
done

# Reload Nginx to pick up new certificates
echo "[INFO] Reloading Nginx..."
cd "$PROJECT_ROOT"

# Try docker-compose first, then docker compose
if command -v docker-compose &> /dev/null; then
    docker-compose exec -T nginx nginx -s reload || {
        echo "[WARN] Failed to reload Nginx via docker-compose"
    }
elif docker compose version &> /dev/null; then
    docker compose exec -T nginx nginx -s reload || {
        echo "[WARN] Failed to reload Nginx via docker compose"
    }
fi

echo "[INFO] SSL certificate renewal completed!"

