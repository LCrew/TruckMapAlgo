#!/usr/bin/env bash
# Downloads the Latvia, Lithuania and Estonia OSM extracts from Geofabrik and merges them
# into one file. Separate overlapping extracts break Valhalla's tile build at the borders.
# Run again (then `./valhalla/scripts/rebuild_tiles.sh`) to refresh road data, e.g. weekly.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources custom_files restrictions
for c in latvia lithuania estonia; do
  echo "Downloading $c..."
  curl -fL --retry 3 -o "sources/$c-latest.osm.pbf" "https://download.geofabrik.de/europe/$c-latest.osm.pbf"
done
echo "Merging with osmium and extracting truck restrictions..."
# restrictions.geojsonseq feeds the map's restriction overlay locally (no Overpass calls).
# The backend reloads it automatically when the file changes.
docker run --rm -v "$PWD/sources:/src" -v "$PWD/custom_files:/out" -v "$PWD/restrictions:/restr" debian:bookworm-slim sh -c \
  "apt-get update -qq && apt-get install -y -qq osmium-tool >/dev/null && \
   osmium merge /src/latvia-latest.osm.pbf /src/lithuania-latest.osm.pbf /src/estonia-latest.osm.pbf \
     -o /out/baltics.osm.pbf --overwrite && \
   osmium tags-filter /out/baltics.osm.pbf nw/maxheight nw/maxweight nw/maxaxleload nw/maxlength nw/maxwidth w/hgv=no \
     -o /restr/restrictions.osm.pbf --overwrite && \
   osmium export /restr/restrictions.osm.pbf -f geojsonseq -o /restr/restrictions.geojsonseq --overwrite && \
   rm /restr/restrictions.osm.pbf"
ls -lh custom_files/baltics.osm.pbf restrictions/restrictions.geojsonseq
