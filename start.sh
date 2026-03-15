#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh  —  Start Mizan locally (backend + worker in venv, frontend, superadmin)
#              Infrastructure (Postgres, Redis) runs in Docker.
#
# Port map
#   Postgres   localhost:5434
#   Redis      localhost:6381
#   Qdrant     cloud or localhost:7004 (set in .env)
#   Backend    localhost:7001
#   Worker     (no port)
#   Frontend   localhost:7002
#   Superadmin localhost:7003
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}${BOLD}==> $*${RESET}"; }
ok()   { echo -e "${GREEN}  ✔ $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${RESET}"; }
die()  { echo -e "${RED}  ✖ $*${RESET}" >&2; exit 1; }

PIDS=()
cleanup() {
  echo ""
  log "Shutting down local processes..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  ok "All local processes stopped."
}
trap cleanup EXIT INT TERM

# ── 1. Stop conflicting containers ───────────────────────────────────────────
log "Stopping any running app containers..."
APP_CONTAINERS=(mizan-backend-1 mizan-worker-1 mizan-frontend-1 mizan-superadmin-1
                mizan_backend_1  mizan_worker_1  mizan_frontend_1  mizan_superadmin_1)
for c in "${APP_CONTAINERS[@]}"; do
  if docker ps --format '{{.Names}}' | grep -qx "$c" 2>/dev/null; then
    docker stop "$c" >/dev/null && ok "Stopped: $c"
  fi
done
docker compose stop backend worker frontend superadmin 2>/dev/null || true

# ── 2. Start infrastructure ──────────────────────────────────────────────────
log "Starting infrastructure containers (db, redis)..."
docker compose up -d db redis

log "Waiting for Postgres on localhost:5434..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U mizan -d mizan -q 2>/dev/null; then
    ok "Postgres ready"; break
  fi
  [ "$i" -eq 30 ] && die "Postgres did not become ready."
  sleep 1
done

log "Waiting for Redis on localhost:6381..."
for i in $(seq 1 20); do
  if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis ready"; break
  fi
  [ "$i" -eq 20 ] && die "Redis did not become ready."
  sleep 1
done
ok "Infrastructure is up."

# ── 3. Python venv ────────────────────────────────────────────────────────────
VENV_DIR="$SCRIPT_DIR/backend/.venv"
PYTHON_BIN=""
for candidate in python3.13 python3.12 python3; do
  if command -v "$candidate" &>/dev/null; then
    PYTHON_BIN="$(command -v "$candidate")"; break
  fi
done
[ -z "$PYTHON_BIN" ] && die "No Python 3 interpreter found."

if [ ! -f "$VENV_DIR/bin/activate" ]; then
  log "Creating Python venv at backend/.venv..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  ok "venv created."
fi
log "Installing Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install -q -r "$SCRIPT_DIR/backend/requirements.txt"
ok "Python dependencies ready."

# ── 4. Env overrides for local dev ───────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -o allexport
  source <(grep -v '^\s*#' "$SCRIPT_DIR/.env" | grep -v '^\s*$' | grep -v '^DATABASE_URL=' | grep -v '^REDIS_URL=')
  set +o allexport
fi
export DATABASE_URL="postgresql+asyncpg://mizan:mizan@localhost:5434/mizan"
export REDIS_URL="redis://localhost:6381/0"
export ALLOWED_ORIGINS='["http://localhost:7002","http://localhost:7003"]'

# ── 5. Alembic migrations ─────────────────────────────────────────────────────
log "Running Alembic migrations..."
(cd "$SCRIPT_DIR/backend" && alembic upgrade head) || true
ok "Migrations applied (or no migration files yet — tables will be auto-created)."

# ── 6. Backend ────────────────────────────────────────────────────────────────
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

log "Starting backend on :7001..."
(
  cd "$SCRIPT_DIR/backend"
  source "$VENV_DIR/bin/activate"
  export DATABASE_URL REDIS_URL ALLOWED_ORIGINS
  uvicorn app.main:app --host 0.0.0.0 --port 7001 --reload >"$LOG_DIR/backend.log" 2>&1
) &
PIDS+=($!)
ok "Backend PID=$! → logs: .logs/backend.log"

# ── 7. Celery worker ─────────────────────────────────────────────────────────
log "Starting Celery worker..."
(
  cd "$SCRIPT_DIR/backend"
  source "$VENV_DIR/bin/activate"
  export DATABASE_URL REDIS_URL
  celery -A app.worker.celery_app worker -l info --pool=solo >"$LOG_DIR/worker.log" 2>&1
) &
PIDS+=($!)
ok "Worker PID=$! → logs: .logs/worker.log"

# ── 8. Frontend ───────────────────────────────────────────────────────────────
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  log "Installing frontend dependencies..."
  (cd "$SCRIPT_DIR/frontend" && npm install --silent)
fi
log "Starting frontend on :7002..."
(
  cd "$SCRIPT_DIR/frontend"
  VITE_API_URL=http://localhost:7001/api/v1 npm run dev -- --host 0.0.0.0 --port 7002 >"$LOG_DIR/frontend.log" 2>&1
) &
PIDS+=($!)
ok "Frontend PID=$! → logs: .logs/frontend.log"

# ── 9. Superadmin ─────────────────────────────────────────────────────────────
if [ ! -d "$SCRIPT_DIR/superadmin/node_modules" ]; then
  log "Installing superadmin dependencies..."
  (cd "$SCRIPT_DIR/superadmin" && npm install --silent)
fi
log "Starting superadmin on :7003..."
(
  cd "$SCRIPT_DIR/superadmin"
  VITE_API_URL=http://localhost:7001/api/v1 npm run dev -- --host 0.0.0.0 --port 7003 >"$LOG_DIR/superadmin.log" 2>&1
) &
PIDS+=($!)
ok "Superadmin PID=$! → logs: .logs/superadmin.log"

# ── 10. Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────────────${RESET}"
echo -e "${GREEN}${BOLD}  Mizan is running locally!${RESET}"
echo -e "${BOLD}────────────────────────────────────────${RESET}"
echo -e "  Postgres   ${CYAN}localhost:5434${RESET}  (Docker)"
echo -e "  Redis      ${CYAN}localhost:6381${RESET}  (Docker)"
echo -e "  Backend    ${CYAN}http://localhost:7001${RESET}"
echo -e "  Frontend   ${CYAN}http://localhost:7002${RESET}"
echo -e "  Superadmin ${CYAN}http://localhost:7003${RESET}"
echo -e "  Logs       ${CYAN}.logs/${RESET}"
echo -e "${BOLD}────────────────────────────────────────${RESET}"
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all processes."
echo ""
wait
