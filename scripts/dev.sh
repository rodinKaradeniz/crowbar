#!/usr/bin/env bash
# Crowbar - Start all development services
# Run from project root: ./scripts/dev.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[dev]${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*"; }

# Wait for a port to be open (max 60s)
wait_for_port() {
  local port=$1
  local name=$2
  log "Waiting for $name on port $port..."
  for i in $(seq 1 60); do
    if python3 -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    s.connect(('localhost', $port))
    s.close()
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; then
      ok "$name is ready"
      return 0
    fi
    sleep 1
  done
  err "$name failed to start on port $port"
  exit 1
}

# Cleanup: kill background processes on exit
cleanup() {
  trap - SIGINT SIGTERM EXIT 2>/dev/null
  log "Shutting down..."
  pids=$(jobs -p 2>/dev/null)
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "=========================================="
echo "  Crowbar - Development Startup"
echo "=========================================="
echo ""

# --- 1. Docker ---
log "Starting Docker containers (postgres, redis, ml)..."
cd "$ROOT/server"
docker compose up -d
cd "$ROOT"
ok "Docker containers started"

wait_for_port 5432 "PostgreSQL"
wait_for_port 6379 "Redis"

# --- 2. Backend ---
log "Setting up backend..."
cd "$ROOT/server"

if [[ ! -d venv ]]; then
  log "Creating Python venv..."
  python3 -m venv venv
  ok "venv created"
fi

source venv/bin/activate

if [[ ! -f .env ]]; then
  warn ".env not found, copying from env.example"
  cp env.example .env
fi

log "Installing backend dependencies..."
pip install -q -r requirements.txt
ok "Backend dependencies installed"

log "Ensuring database exists..."
docker compose exec -T postgres createdb -U postgres crowbar 2>/dev/null || true

log "Running migrations + seeding test data..."
SEED_DATA=true python -m db.migrate
ok "Database migrated and seeded"

# --- 3. Frontend ---
log "Setting up frontend..."
cd "$ROOT/client"
if [[ ! -d node_modules ]]; then
  log "Installing npm dependencies..."
  npm install
  ok "Frontend dependencies installed"
else
  ok "Frontend dependencies already installed"
fi

# --- 4. Start services in background ---
echo ""
log "Starting services..."
echo ""

cd "$ROOT/server"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

cd "$ROOT/client"
npm run dev &
FRONTEND_PID=$!

# Give services time to start
sleep 5

# --- 5. Status report ---
echo ""
echo "=========================================="
echo "  Crowbar - Services Running"
echo "=========================================="
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  ML:        http://localhost:8001"
echo ""
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "=========================================="
echo ""

# Keep script running; trap will clean up on Ctrl+C
wait
