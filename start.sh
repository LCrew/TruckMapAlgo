#!/usr/bin/env bash
# Starts the Baltic Truck Planner (after ./setup.sh has been run once) and prints its address.
# Usage: ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f valhalla/custom_files/baltics.osm.pbf ]; then
  echo "Not set up yet: run ./setup.sh first (downloads map data and builds the router)."
  exit 1
fi
[ -f .env ] && { set -a; . ./.env; set +a; }

docker compose up -d

echo "Waiting for the app to come up..."
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${BACKEND_PORT:-8000}/api/health" | grep -q '"valhalla":{"ok":true'; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
    echo
    echo "Baltic Truck Planner is running: http://${ip:-localhost}:${APP_PORT:-5173}"
    echo "Stop: docker compose down · Logs: docker compose logs -f · Update: git pull && docker compose up -d --build"
    exit 0
  fi
  sleep 2; printf '.'
done
echo
echo "Started, but the router is not answering yet (it may still be building its map)."
echo "Check with: docker compose ps  and  docker logs -f truckmap-valhalla"
exit 1
