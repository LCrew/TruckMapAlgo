#!/usr/bin/env bash
# One-shot setup: map data → routing tiles → all services.
# Usage: ./setup.sh        (re-running is safe; downloads fresh OSM data each time)
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker is not installed (see README)."; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose plugin missing (see README)."; exit 1; }
command -v curl >/dev/null || { echo "curl is required."; exit 1; }

[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example (edit APP_PORT / GITHUB_TOKEN as needed)."; }
set -a; . ./.env; set +a

./valhalla/scripts/fetch_osm.sh
docker compose up -d --build
./valhalla/scripts/wait_and_limit.sh

echo
echo "Baltic Truck Planner is running: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost):${APP_PORT:-5173}"
