#!/usr/bin/env bash
# Rebuild the self-hosted vector basemap (data/tiles/*.pmtiles).
#
# Source: Protomaps daily planet build (OpenStreetMap + Natural Earth, ODbL),
#         read remotely with HTTP range requests — only the needed tiles are downloaded.
# Needs:  pmtiles CLI   https://github.com/protomaps/go-pmtiles/releases  (on PATH or ./bin/pmtiles)
#         python3 + `pip install pmtiles`
#
#   world.pmtiles  z0–6   whole world           (land, water; roads/places at z6 only)
#   east.pmtiles   z7–9   eastern China         (JJJ, YRD, GBA, Chengdu, Xi'an …)
#   bj.pmtiles     z9–13  Beijing               (city zoom: roads, parks, districts)
#   sz.pmtiles     z9–13  Shenzhen / Hong Kong
#
# Add another detailed city: copy a line below with its bbox, then add the file to
# TILES in js/map.js.
set -euo pipefail
cd "$(dirname "$0")/.."
PMTILES=${PMTILES:-$(command -v pmtiles || echo ./bin/pmtiles)}
BUILD=${BUILD:-$(curl -s https://build-metadata.protomaps.dev/builds.json | python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"])')}
SRC="https://build.protomaps.com/$BUILD"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "source: $SRC"
mkdir -p data/tiles

extract() {  # name minzoom maxzoom [bbox] [filter options]
  local args=(--minzoom="$2" --maxzoom="$3"); [ -n "${4:-}" ] && args+=(--bbox="$4")
  "$PMTILES" extract "$SRC" "$TMP/$1.pmtiles" "${args[@]}"
  python3 scripts/filter_tiles.py "$TMP/$1.pmtiles" "data/tiles/$1.pmtiles" ${5:-}
}

extract world 0 6
extract east  7 9  102,18,125,42.5
extract bj    9 13  115.7,39.45,117.1,40.45  --major-from=9
extract sz    9 13  113.6,22.25,114.6,22.9   --major-from=9
ls -lh data/tiles
