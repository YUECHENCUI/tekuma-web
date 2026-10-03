#!/usr/bin/env bash
# Rebuild the vendored map data in data/geo/ (only needed if you change map sources).
# Requires Node.js. Run from the repo root:  bash scripts/build-geo.sh
# Sources:
#   China (official standard boundary incl. Taiwan, South Tibet, Aksai Chin, nine-dash line):
#     Alibaba DataV  https://geo.datav.aliyun.com/areas_v3/bound/{adcode}.json
#   Then derives data/geo/overlay.json (what the map actually loads) via scripts/build-overlay.js.
set -euo pipefail
TMP=$(mktemp -d)
DATAV=https://geo.datav.aliyun.com/areas_v3/bound
for code in 100000_full 110000_full 120000_full 130000_full 310000_full 320000_full 330000_full 340000_full 440000_full 810000 820000; do
  curl -sSf -o "$TMP/$code.json" "$DATAV/$code.json"
done
MS="${MAPSHAPER:-npx --yes mapshaper@0}"

# 2) China provinces + nine-dash line (DataV, official boundary)
$MS -i "$TMP/100000_full.json" \
  -filter 'adcode != "100000_JD"' + name=provinces \
  -target 1 -filter 'adcode == "100000_JD"' + name=nineDash \
  -target provinces,nineDash \
  -each 'delete parent; delete subFeatureIndex; delete acroutes; delete childrenNum; delete level; delete center; delete centroid' \
  -o format=topojson quantization=1e5 target=provinces,nineDash data/geo/china.json

# 3) Prefecture / district level for the focus regions (JJJ, YRD, GBA)
$MS -i "$TMP"/{110000_full,120000_full,130000_full,310000_full,320000_full,330000_full,340000_full,440000_full,810000,820000}.json combine-files \
  -merge-layers force name=cities \
  -each 'var p = String(adcode).slice(0,2); var gba=[440100,440300,440400,440600,441300,441900,442000,440700,441200,810000,820000]; tags = []; if (p=="11"||p=="12"||p=="13") tags.push("jjj"); if (p=="31"||p=="32"||p=="33"||p=="34") tags.push("yrd"); if (gba.indexOf(+adcode) > -1) tags.push("gba"); tags = tags.join(",")' \
  -filter-fields adcode,name,tags \
  -simplify 25% keep-shapes \
  -o format=topojson quantization=1e5 data/geo/china-cities.json
rm -rf "$TMP"
node scripts/build-overlay.js
ls -la data/geo
