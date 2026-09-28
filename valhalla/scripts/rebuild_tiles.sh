#!/usr/bin/env bash
# Rebuilds Valhalla routing tiles from custom_files/baltics.osm.pbf (run fetch_osm.sh first),
# waits for the build and re-applies the service limits.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose stop valhalla || true
# tiles are written by the container as root: delete them from a container too (no sudo needed)
docker run --rm -v "$PWD/valhalla/custom_files:/c" alpine:3 sh -c \
  'rm -rf /c/valhalla_tiles /c/valhalla_tiles.tar /c/file_hashes.txt /c/admins.sqlite /c/timezones.sqlite /c/valhalla.json'
docker compose up -d valhalla
./valhalla/scripts/wait_and_limit.sh
