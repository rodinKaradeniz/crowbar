#!/usr/bin/env bash
# Crowbar - Start all development services
# Run from project root: ./scripts/dev.sh
#
#   ./scripts/dev.sh                          full stack (Docker, API, ML, web)
#   ./scripts/dev.sh --demo                   frontend-only demo on its own mock API
#   ./scripts/dev.sh --demo --demo-api-url=URL   demo frontend against another mock,
#                                             e.g. https://<demo-domain>/demo-api
#
# Environment options for the full stack are unchanged: SEED_DATA=true,
# KILL_STALE=true. KILL_STALE also applies to --demo.

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- Flags: parsed before anything starts, so nonsense never half-starts ---
USAGE="usage: ./scripts/dev.sh [--demo [--demo-api-url=URL]]"
SCRIPT_ARGS="$*"
DEMO=false
DEMO_API_URL=""
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=true ;;
    --demo-api-url=?*) DEMO_API_URL="${arg#--demo-api-url=}" ;;
    *) echo "$USAGE" >&2; exit 2 ;;
  esac
done
if [[ -n "$DEMO_API_URL" && "$DEMO" != "true" ]]; then
  echo "$USAGE  (--demo-api-url needs --demo)" >&2; exit 2
fi
if [[ "$DEMO" == "true" && "${SEED_DATA:-false}" == "true" ]]; then
  echo "$USAGE  (--demo starts no database, so SEED_DATA does not apply)" >&2; exit 2
fi
if [[ -n "$DEMO_API_URL" && ! "${DEMO_API_URL%/}" =~ ^https?://.+/demo-api$ ]]; then
  echo "$USAGE  (URL must be an http(s) address ending in /demo-api)" >&2; exit 2
fi

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

# PIDs of anything listening on a TCP port (empty when free)
port_listeners() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }

# Refuse to start on an occupied port. A leftover uvicorn --reload keeps serving
# stale code while this run's backend silently fails to bind, so this is fatal
# unless KILL_STALE=true asks us to reclaim the port.
require_free_port() {
  local port=$1 name=$2 pids
  pids=$(port_listeners "$port")
  [[ -z "$pids" ]] && return 0

  if [[ "${KILL_STALE:-false}" == "true" ]]; then
    warn "$name port $port in use — stopping PID(s) $(echo $pids) (KILL_STALE=true)"
    kill $pids 2>/dev/null || true
    for _ in $(seq 1 10); do
      [[ -z "$(port_listeners "$port")" ]] && break
      sleep 1
    done
    pids=$(port_listeners "$port")
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
    sleep 1
    if [[ -n "$(port_listeners "$port")" ]]; then
      err "$name port $port is still in use after kill -9"
      exit 1
    fi
    ok "$name port $port reclaimed"
    return 0
  fi

  err "$name port $port is already in use:"
  ps -o pid,command -p $(echo $pids | tr ' ' ',') 2>/dev/null | sed '1d' | sed 's/^/    /'
  err "Stop it, or re-run with: KILL_STALE=true ./scripts/dev.sh${SCRIPT_ARGS:+ $SCRIPT_ARGS}"
  exit 1
}

# Each background service gets its own process group so cleanup can take down
# its children too (uvicorn --reload forks a worker that outlives its parent).
set -m

# Cleanup: kill background process groups on exit
cleanup() {
  local status=$?
  trap - SIGINT SIGTERM EXIT 2>/dev/null
  log "Shutting down..."
  for pid in ${BACKEND_PID:-} ${FRONTEND_PID:-}; do
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit $status
}
trap cleanup SIGINT SIGTERM EXIT

# --- Demo: the frontend alone, talking to a mock API. No Docker, no venv, no
# migrations, no uvicorn, no ML. The API URLs go in the process environment,
# which Next ranks above client/.env*, so a developer's env file cannot point
# the demo at a real backend — and next.config.ts refuses to build if it did.
if [[ "$DEMO" == "true" ]]; then
  DEMO_API_URL="${DEMO_API_URL%/}"

  echo ""
  echo "=========================================="
  echo "  Crowbar - Demo Startup (no backend)"
  echo "=========================================="
  echo ""

  require_free_port 3000 "Frontend"

  log "Setting up frontend..."
  cd "$ROOT/client"
  if [[ ! -d node_modules ]]; then
    log "Installing npm dependencies..."
    npm install
    ok "Frontend dependencies installed"
  else
    ok "Frontend dependencies already installed"
  fi

  # No API URL unless one was asked for: the demo then answers every backend
  # call in its own process. Passing them here (empty or not) keeps Next from
  # reading a developer's client/.env, which would point the demo at a real
  # backend — and next.config.ts refuses to build if it ever did.
  NEXT_PUBLIC_CROWBAR_DEMO=true \
    API_INTERNAL_URL="$DEMO_API_URL" \
    NEXT_PUBLIC_API_URL="$DEMO_API_URL" \
    npm run dev &
  FRONTEND_PID=$!

  wait_for_port 3000 "Frontend"

  echo ""
  echo "=========================================="
  echo "  Crowbar DEMO - no backend is running"
  echo "=========================================="
  echo ""
  echo "  Demo:      http://localhost:3000/auth/login"
  echo "  Mock API:  ${DEMO_API_URL:-in this process (no backend, no network)}"
  echo ""
  echo "  Read-only sample evening: nothing is saved,"
  echo "  no guest is contacted, boards do not update live."
  echo ""
  echo "  Press Ctrl+C to stop"
  echo "=========================================="
  echo ""

  wait
fi

echo ""
echo "=========================================="
echo "  Crowbar - Development Startup"
echo "=========================================="
echo ""

# --- 0. Port preflight (app ports only; 5432/6379 belong to Docker) ---
require_free_port 8000 "Backend"
require_free_port 3000 "Frontend"

# --- 1. Docker ---
# --build, not a bare `up -d`. The ml service builds from ../ml, and Compose
# reuses an existing image forever unless asked to rebuild — so every change
# under ml/ silently did not take effect. The container drifted far enough that
# POST /api/insights/run failed on `column r.payment_amount does not exist`, a
# column migration 013 dropped: the repo's ml/src no longer mentions it, the
# running image's copy still did. That reads as a Crowbar defect and is not one.
# The layer cache makes the no-change case cheap; a real change costs a rebuild
# here instead of an afternoon.
log "Starting Docker containers (postgres, redis, ml)..."
cd "$ROOT/server"
docker compose up -d --build
cd "$ROOT"
ok "Docker containers started"

wait_for_port 5432 "PostgreSQL"
wait_for_port 6379 "Redis"
# The banner below advertises the ML service; wait for it rather than printing a
# URL that is not listening yet.
wait_for_port 8001 "ML"

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

if [[ "${SEED_DATA:-false}" == "true" ]]; then
  # The demo tenant seeds with a known local-only password unless
  # DEMO_ADMIN_PASSWORD pins something else. The seeder prints it.
  log "Running migrations + seeding demo data..."
  SEED_DATA=true python -m db.migrate
  ok "Database migrated and seeded"
else
  log "Running migrations..."
  python -m db.migrate
  ok "Database migrated (no demo data; re-run with SEED_DATA=true to seed)"
fi

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

# Confirm both actually bound their ports before reporting them as running
wait_for_port 8000 "Backend"
wait_for_port 3000 "Frontend"

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
