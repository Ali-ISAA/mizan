#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-docker.sh  —  Start all Mizan services via Docker Compose
#
# Port map (host → container)
#   Postgres   5435:5432
#   Redis      6382:6379
#   Qdrant     7014:6333
#   Backend    8001:8000
#   Worker     (internal only)
#   Frontend   8002:7002
#   Superadmin 8003:7003
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Starting all Mizan services with Docker Compose..."
docker compose up --build "$@"
