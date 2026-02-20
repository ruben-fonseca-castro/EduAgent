#!/usr/bin/env bash
# =============================================================================
#  numénor.ai — Oracle VM Deployment Script
#  Run this on the Oracle Cloud VM after first-time setup is done.
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh          # first deploy
#    ./deploy.sh update   # pull latest + restart
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/ruben-fonseca-castro/EduAgent.git"
APP_DIR="/root/numenorai"
COMPOSE_FILE="docker-compose.hackathon.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Detect mode ──────────────────────────────────────────────────────────────
MODE="${1:-deploy}"

# ── Sanity checks ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "Docker not installed. Run setup first."
command -v git    >/dev/null 2>&1 || die "Git not installed."

if [[ ! -f /root/.oci/config || ! -f /root/.oci/secret.pem ]]; then
  die "OCI credentials missing. Copy ~/.oci/config and ~/.oci/secret.pem to the VM first."
fi

# ── Update mode: pull + rebuild + restart ────────────────────────────────────
if [[ "$MODE" == "update" ]]; then
  log "Pulling latest code..."
  cd "$APP_DIR"
  git pull origin main
  log "Rebuilding and restarting containers..."
  docker compose -f "$COMPOSE_FILE" up -d --build
  log "Done! Backend running on port 8000."
  docker compose -f "$COMPOSE_FILE" ps
  exit 0
fi

# ── First deploy ─────────────────────────────────────────────────────────────
log "Starting numénor.ai first-time deployment..."

# Clone or update repo
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo already cloned — pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  log "Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Verify .env.prod exists
if [[ ! -f "$APP_DIR/backend/.env.prod" ]]; then
  die "backend/.env.prod not found. It should be committed to the repo."
fi

# Warn if ALLOWED_ORIGINS still has placeholder
if grep -q "YOUR_NETLIFY_SUBDOMAIN" "$APP_DIR/backend/.env.prod"; then
  warn "ALLOWED_ORIGINS in .env.prod still has placeholder value."
  warn "Update it with your Netlify URL after frontend deployment."
fi

# Set correct OCI key_file path (in case local path was different)
log "Verifying OCI config..."
sed -i 's|key_file=.*|key_file=/root/.oci/secret.pem|' /root/.oci/config
chmod 600 /root/.oci/secret.pem /root/.oci/config

# Open firewall port (Oracle Cloud uses iptables by default)
log "Opening port 8000 in iptables..."
iptables -I INPUT -p tcp --dport 8000 -j ACCEPT || true
# Persist across reboots (Ubuntu/Debian)
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save || true
elif command -v iptables-save >/dev/null 2>&1; then
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

# Pull/build and start
log "Building Docker image and starting backend..."
docker compose -f "$COMPOSE_FILE" up -d --build

# Wait for health check
log "Waiting for backend to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    log "Backend is healthy!"
    break
  fi
  if [[ $i -eq 30 ]]; then
    warn "Health check timed out. Check logs: docker compose -f $COMPOSE_FILE logs -f"
  fi
  sleep 3
done

# Print summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN} numénor.ai backend deployed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
VM_IP=$(curl -sf http://checkip.amazonaws.com 2>/dev/null || echo "YOUR_VM_IP")
echo ""
echo "  API base URL : http://${VM_IP}:8000"
echo "  Health check : http://${VM_IP}:8000/health"
echo "  API docs     : http://${VM_IP}:8000/docs"
echo ""
echo "  Next steps:"
echo "  1. Deploy frontend to Netlify"
echo "  2. Set NEXT_PUBLIC_API_URL=http://${VM_IP}:8000 in Netlify env vars"
echo "  3. Update ALLOWED_ORIGINS in backend/.env.prod with your Netlify URL"
echo "  4. Run: ./deploy.sh update"
echo ""
echo "  Useful commands:"
echo "  docker compose -f $COMPOSE_FILE logs -f      # stream logs"
echo "  docker compose -f $COMPOSE_FILE ps           # check status"
echo "  docker compose -f $COMPOSE_FILE restart      # restart"
echo ""
