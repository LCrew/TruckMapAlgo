#!/usr/bin/env bash
# Waits until Valhalla has built its tiles and answers, then raises its service limits
# (the default 400 km matrix limit is too small for Baltic-wide runs) and restarts it.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "Waiting for the routing engine (first build takes ~5–15 min; follow with: docker logs -f truckmap-valhalla)..."
until curl -sf http://127.0.0.1:8002/status >/dev/null; do sleep 10; printf '.'; done
echo
docker run --rm -v "$PWD/valhalla:/v" python:3.12-alpine python /v/scripts/apply_limits.py
docker compose restart valhalla
until curl -sf http://127.0.0.1:8002/status >/dev/null; do sleep 3; done
echo "Routing engine ready."
