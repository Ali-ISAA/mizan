#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-docker.sh  —  Start all Mizan services via Docker Compose
#
# Port map (host → container)
#   Postgres   5435:5432   (DMS uses 5434)
#   Redis      6382:6379   (DMS uses 6381)
#   Qdrant     7014:6333   (DMS uses 7004)
#   Backend    8001:8000   (DMS uses 7001)
#   Worker     (internal only)
#   Frontend   8002:7002   (DMS uses 7002)
#   Superadmin 8003:7003   (DMS uses 7003)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Starting all Mizan services with Docker Compose..."
docker compose up --build "$@"
