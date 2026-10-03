#!/usr/bin/env node
/* Build data/geo/overlay.json — the China layer drawn on top of the vector basemap.
   Input:  data/geo/china.json (provinces + nine-dash line) and data/geo/china-cities.json
           (prefecture level for JJJ / YRD / GBA), both from Alibaba DataV (official
           Chinese standard map boundary; see scripts/build-geo.sh).
   Output: one GeoJSON FeatureCollection, features tagged with `kind`:
             land      China as one polygon (subtle tint at low zoom)
             outline   national boundary
             province  province boundaries
             ninedash  South China Sea nine-dash line
           plus a foreign member `regions`: camera bounds [[w,s],[e,n]] for each map filter.
   usage:  node scripts/build-overlay.js */
const fs = require('fs'), path = require('path');
const topojson = require(path.join(__dirname, '../vendor/topojson-client.v3.min.js'));
const root = path.join(__dirname, '..');
const china = JSON.parse(fs.readFileSync(path.join(root, 'data/geo/china.json')));
const cities = JSON.parse(fs.readFileSync(path.join(root, 'data/geo/china-cities.json')));

const r4 = (c) => Array.isArray(c[0]) ? c.map(r4) : [Math.round(c[0] * 1e3) / 1e3, Math.round(c[1] * 1e3) / 1e3];
// Ramer–Douglas–Peucker on every line / ring (tolerance in degrees); keeps closed rings closed
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L : Math.hypot(pts[i][0] - x1, pts[i][1] - y1);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 || pts[0][0] !== pts[pts.length - 1][0] ? out : pts;
}
const simp = (c, tol) => typeof c[0][0] === 'number' ? rdp(c, tol) : c.map((x) => simp(x, tol));
const TOL = { land: 0.03, outline: 0.003, province: 0.005, ninedash: 0 };   // sub-pixel at the zooms each layer is visible
const feat = (kind, geometry) => ({ type: 'Feature', properties: { kind }, geometry: { type: geometry.type, coordinates: r4(TOL[kind] ? simp(geometry.coordinates, TOL[kind]) : geometry.coordinates) } });

function bbox(geoms) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  geoms.forEach((g) => walk(g.coordinates));
  return [[+w.toFixed(3), +s.toFixed(3)], [+e.toFixed(3), +n.toFixed(3)]];
}

const P = china.objects.provinces, D = china.objects.nineDash;
const land = topojson.merge(china, P.geometries);
const outline = topojson.mesh(china, P, (a, b) => a === b);
const provinces = topojson.mesh(china, P, (a, b) => a !== b);
const nineDash = topojson.feature(china, D);
const nd = nineDash.features.map((f) => f.geometry);

const cityFeats = topojson.feature(cities, cities.objects.cities).features;
const regions = {
  china: bbox([land].concat(nd)),
  jjj: bbox(cityFeats.filter((f) => f.properties.tags.includes('jjj')).map((f) => f.geometry)),
  yrd: bbox(cityFeats.filter((f) => f.properties.tags.includes('yrd')).map((f) => f.geometry)),
  gba: bbox(cityFeats.filter((f) => f.properties.tags.includes('gba')).map((f) => f.geometry)),
};

const out = {
  type: 'FeatureCollection',
  regions,
  features: [feat('land', land), feat('outline', outline), feat('province', provinces)].concat(nd.map((g) => feat('ninedash', g))),
};
fs.writeFileSync(path.join(root, 'data/geo/overlay.json'), JSON.stringify(out));
console.log('data/geo/overlay.json', (fs.statSync(path.join(root, 'data/geo/overlay.json')).size / 1024).toFixed(0) + ' KB', JSON.stringify(regions));
