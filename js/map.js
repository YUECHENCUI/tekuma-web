/* ==========================================================================
   TEKUMA · Project map (P2)
   MapLibre GL JS (vendored) + self-hosted Protomaps vector tiles (PMTiles,
   read with HTTP range requests from this site — no keys, no third-party hosts).
   China's boundary, provinces and the nine-dash line come from Alibaba DataV
   (official standard map, data/geo/overlay.json); the tiles' own boundaries are
   never drawn. Markers, labels and the card live in an SVG/HTML overlay.
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TEKUMA;
  var section = document.getElementById('map');
  if (!section) return;

  /* ---- Look & behaviour (safe to tweak) ---------------------------------- */
  var C = {
    water: '#DCDEDE',      // sea, lakes, rivers: cool grey, the darkest plane (as on OMA's map)
    land: '#F5F5F3',       // all land
    china: '#FCFCFB',      // China, slightly lifted at world / country zoom
    park: '#EDEEEA',       // parks at city zoom
    road: '#E2E2DE',       // streets: quiet grey hairlines on light land
    highway: '#D3D3CF',
    province: '#D9D9D4',   // DataV province lines
    outline: '#B9B9B3',    // DataV national boundary
    dash: '#A7A7A1',       // nine-dash line
    label: '#8C8C87',
    labelHalo: '#F5F5F3'
  };
  // vector tile archives (scripts/build-tiles.sh). Finer archives draw on top of coarser ones.
  var TILES = [
    { id: 'world', url: 'data/tiles/world.pmtiles', from: 0, roadsTo: 7 },
    { id: 'east', url: 'data/tiles/east.pmtiles', from: 7, roadsTo: 10 },
    { id: 'bj', url: 'data/tiles/bj.pmtiles', from: 9, roadsTo: 24 },
    { id: 'sz', url: 'data/tiles/sz.pmtiles', from: 9, roadsTo: 24 }
  ];
  var GLOBAL_CENTER = 150;          // world view centred on 150°E, as on Chinese standard world maps
  var PORTRAIT_CENTER = [105, 28];  // tall screens crop the world around Asia (drag to see the rest)
  var GLOBAL_LAT = [-55, 75];
  var COUNTRY_ZOOM = 2.6;           // below this, countries with ≥3 projects collapse into one marker
  var CITY_SPREAD = 4;              // a city's projects (Beijing, Shenzhen …) form one marker until they spread over 4× the cluster radius
  var MAX_ZOOM = 14, FIT_MAX_ZOOM = 13;
  var DEPTH = { global: 0, china: 1, jjj: 2, yrd: 2, gba: 2 };
  var REGION_ALIAS = { beijing: 'jjj', bj: 'jjj', tianjin: 'jjj', hebei: 'jjj', shenzhen: 'gba', sz: 'gba' };
  var COMPACT_QUERY = '(max-width: 680px), (max-height: 540px)';   // keep in sync with css/style.css

  var mqCompact = window.matchMedia(COMPACT_QUERY);
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var NS = 'http://www.w3.org/2000/svg';

  var glEl = section.querySelector('.map-gl');
  var svg = section.querySelector('.map-overlay');
  var gLabels = el('g', { 'class': 'labels' }, svg);
  var gMarks = el('g', { 'class': 'marks' }, svg);
  var card = section.querySelector('.map-card');
  var filters = section.querySelector('.map-filters');
  var toggle = section.querySelector('.map-filter-toggle');

  var map = null, overlay = null, projects = [];
  var state = { region: 'global', year: 'all' };
  var W = 0, H = 0;
  var groups = [], clusterZoom = null, labelsShown = false;
  var measureCtx = document.createElement('canvas').getContext('2d');

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function abs(u) { return new URL(u, location.href).href; }
  function labelSize() { return parseFloat(getComputedStyle(section).getPropertyValue('--label')) || 11; }
  function markScale() { return labelSize() / 11; }
  function clusterPx() { return (mqFine.matches ? 24 : 32) * markScale(); }

  /* ---- Style -------------------------------------------------------------- */
  function nameExpr() {
    return T.lang() === 'zh'
      ? ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], ['get', 'name:en'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name']];
  }

  var POLY = ['==', ['geometry-type'], 'Polygon'];
  function buildStyle() {
    var sources = {}, layers = [{ id: 'bg', type: 'background', paint: { 'background-color': C.water } }];
    TILES.forEach(function (t) { sources[t.id] = { type: 'vector', url: 'pmtiles://' + abs(t.url) }; });
    sources.cn = { type: 'geojson', data: overlay, tolerance: 0.3 };

    // land + water from every archive; each finer archive repaints both inside its tiles
    TILES.forEach(function (t) {
      layers.push({ id: t.id + '-earth', type: 'fill', source: t.id, 'source-layer': 'earth', filter: POLY, paint: { 'fill-color': C.land, 'fill-antialias': false } });
      layers.push({ id: t.id + '-water', type: 'fill', source: t.id, 'source-layer': 'water', filter: POLY, paint: { 'fill-color': C.water } });
      if (t.from >= 9) layers.push({ id: t.id + '-park', type: 'fill', source: t.id, 'source-layer': 'landuse', filter: POLY, paint: { 'fill-color': C.park, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 11.5, 1] } });
    });
    // China, a touch lighter than the rest of the world at low zoom (fades before coastlines diverge)
    layers.push({ id: 'cn-land', type: 'fill', source: 'cn', filter: ['==', ['get', 'kind'], 'land'],
      paint: { 'fill-color': C.china, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 1, 6.2, 0] } });
    // roads: white hairlines that thicken at city zoom; one archive per zoom band, no duplicates
    TILES.forEach(function (t) {
      var minz = Math.max(t.from, 5.5);
      var common = { type: 'line', source: t.id, 'source-layer': 'roads', minzoom: minz, maxzoom: t.roadsTo, layout: { 'line-cap': 'round', 'line-join': 'round' } };
      layers.push(Object.assign({ id: t.id + '-roads', paint: {
        'line-color': ['match', ['get', 'kind'], 'highway', C.highway, C.road],
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, ['match', ['get', 'kind'], 'highway', 0.45, 0.3], 10, ['match', ['get', 'kind'], 'highway', 1.1, 'major_road', 0.7, 0.4], 14, ['match', ['get', 'kind'], 'highway', 3.2, 'major_road', 2.2, 1.1]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 7, 1] } }, common));
    });
    // official China boundary (DataV): provinces fade at city zoom; the coastline-bearing outline
    // fades before it could visibly diverge from the tile coastline
    layers.push({ id: 'cn-province', type: 'line', source: 'cn', filter: ['==', ['get', 'kind'], 'province'],
      paint: { 'line-color': C.province, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 6, 0.9], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 8.5, 0] } });
    layers.push({ id: 'cn-outline', type: 'line', source: 'cn', filter: ['==', ['get', 'kind'], 'outline'],
      paint: { 'line-color': C.outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0] } });
    layers.push({ id: 'cn-ninedash', type: 'fill', source: 'cn', filter: ['==', ['get', 'kind'], 'ninedash'], paint: { 'fill-color': C.dash } });
    layers.push({ id: 'cn-ninedash-line', type: 'line', source: 'cn', filter: ['==', ['get', 'kind'], 'ninedash'], paint: { 'line-color': C.dash, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 8, 1.4] } });
    // place names: only from zoom 8, small and quiet; districts / towns appear at city zoom
    TILES.forEach(function (t) {
      layers.push({ id: t.id + '-places', type: 'symbol', source: t.id, 'source-layer': 'places', minzoom: Math.max(8, t.from),
        filter: ['all', ['==', ['get', 'kind'], 'locality'], ['<=', ['coalesce', ['get', 'min_zoom'], 0], ['+', ['zoom'], 1]]],
        layout: {
          'text-field': nameExpr(), 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10.5, 13, ['match', ['get', 'kind_detail'], 'town', 11, 12.5]],
          'text-letter-spacing': 0.06, 'text-max-width': 8, 'text-padding': 6,
          'symbol-sort-key': ['-', 20, ['coalesce', ['get', 'population_rank'], 0]]
        },
        paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.4, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.6, 1] } });
    });
    return {
      version: 8, sources: sources, layers: layers,
      glyphs: abs('assets/glyphs/') + '{fontstack}/{range}.pbf'
    };
  }

  /* ---- Camera: web-mercator fit with padding computed from the real UI ---- */
  function mx(lng) { return (lng + 180) / 360; }
  function my(lat) { var s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
  function ilng(x) { return x * 360 - 180; }
  function ilat(y) { return 360 / Math.PI * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90; }

  function rel(e) {
    var b = section.getBoundingClientRect(), r = e.getBoundingClientRect();
    return { x0: r.left - b.left, x1: r.right - b.left, y0: r.top - b.top, y1: r.bottom - b.top, w: r.width, h: r.height };
  }
  function visible(e) { return e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'; }

  /* Two candidate safe areas — UI as a band above the map, or as a column beside it.
     The fit uses whichever gives the bigger map (ultrawide, 5:4, iPad, phones). */
  function paddings() {
    var compact = mqCompact.matches;
    var edge = compact ? 16 : Math.max(32, Math.min(72, W * 0.035));
    var gap = compact ? 12 : 32;
    var f = rel(compact ? toggle : filters);
    var foot = [section.querySelector('.map-count'), section.querySelector('.map-zoom')].filter(visible).map(rel);
    var bottom = edge;
    foot.forEach(function (r) { if (r.y0 > H / 2) bottom = Math.max(bottom, H - r.y0 + gap); });
    var band = { t: Math.max(edge, f.y1 + gap), r: edge, b: bottom, l: edge };
    var col = { t: edge, r: edge, b: bottom, l: f.x1 + gap };
    return compact || f.w > W * 0.6 ? [band] : [band, col];
  }

  function fitBounds(b, pad) {
    var x0 = mx(b[0][0]), x1 = mx(b[1][0]), y0 = my(b[1][1]), y1 = my(b[0][1]);
    var aw = Math.max(60, W - pad.l - pad.r), ah = Math.max(60, H - pad.t - pad.b);
    var z = Math.log2(Math.min(aw / ((x1 - x0) * 512), ah / ((y1 - y0) * 512)));
    return camera((x0 + x1) / 2, (y0 + y1) / 2, Math.min(FIT_MAX_ZOOM, z), pad, aw, ah);
  }
  // camera whose padded viewport is centred on world point (cx, cy)
  function camera(cx, cy, z, pad, aw, ah) {
    var S = 512 * Math.pow(2, z);
    var ox = (pad.l + aw / 2 - W / 2) / S, oy = (pad.t + ah / 2 - H / 2) / S;
    return { center: [ilng(cx - ox), ilat(cy - oy)], zoom: z };
  }

  function globalCamera(pad) {
    var aw = Math.max(60, W - pad.l - pad.r), ah = Math.max(60, H - pad.t - pad.b);
    var yTop = my(GLOBAL_LAT[1]), yBot = my(GLOBAL_LAT[0]);
    var z = Math.log2(aw / 512);                      // whole world across the width, no repeats
    var worldAspect = 1 / (yBot - yTop), aspect = aw / ah;
    var zoom = Math.max(1, Math.min(2.8, worldAspect / aspect * 0.85));
    if (zoom > 1.05) return camera(mx(PORTRAIT_CENTER[0]), my(PORTRAIT_CENTER[1]), z + Math.log2(zoom), pad, aw, ah);
    return camera(mx(GLOBAL_CENTER), (yTop + yBot) / 2, z, pad, aw, ah);
  }

  function regionCamera(r) {
    var best = null;
    paddings().forEach(function (pad) {
      var c = r === 'global' ? globalCamera(pad) : fitBounds(overlay.regions[r], pad);
      if (!best || c.zoom > best.zoom + 0.03) best = c;
    });
    return best;
  }

  function fly(cam) {
    if (mqReduce.matches) map.jumpTo(cam);
    else map.flyTo(Object.assign({ speed: 1.15, curve: 1.42, essential: true }, cam));
  }

  /* ---- Projects: filter + screen-space clustering ------------------------- */
  function inRegion(p, r) { return r === 'global' || (p.regions || []).indexOf(r) > -1; }
  function yearOk(p) { return state.year === 'all' || +p.year === +state.year; }
  function shown() { return projects.filter(yearOk); }

  function project(lng, lat) {
    var c = map.getCenter().lng;
    return map.project([lng + 360 * Math.round((c - lng) / 360), lat]);
  }

  function buildGroups() {
    var z = map.getZoom(), list = shown(), out = [];
    if (z < COUNTRY_ZOOM && state.region === 'global') {
      var byC = {};
      list.forEach(function (p) { (byC[p.country] = byC[p.country] || []).push(p); });
      Object.keys(byC).forEach(function (k) {
        if (byC[k].length >= 3) { out.push(makeGroup(byC[k], 'country')); list = list.filter(function (p) { return p.country !== k; }); }
      });
    }
    // units = whole cities while still compact on screen, else single projects; then merge units that collide
    var units = [], R = clusterPx();
    var byCity = {};
    list.forEach(function (p) { var k = p.country + '|' + p.city_en.split(' · ')[0]; (byCity[k] = byCity[k] || []).push(p); });
    Object.keys(byCity).forEach(function (k) {
      var ps = byCity[k], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      ps.forEach(function (p) { var xy = project(p.lng, p.lat); x0 = Math.min(x0, xy.x); x1 = Math.max(x1, xy.x); y0 = Math.min(y0, xy.y); y1 = Math.max(y1, xy.y); });
      if (ps.length > 1 && Math.hypot(x1 - x0, y1 - y0) < CITY_SPREAD * R) units.push(ps);
      else ps.forEach(function (p) { units.push([p]); });
    });
    var used = [];
    var pts = units.map(function (ps) {
      var lng = 0, lat = 0; ps.forEach(function (p) { lng += p.lng; lat += p.lat; });
      var xy = project(lng / ps.length, lat / ps.length); return { ps: ps, x: xy.x, y: xy.y };
    });
    pts.sort(function (a, b) { return b.ps.length - a.ps.length; });
    pts.forEach(function (a, i) {
      if (used[i]) return;
      var members = a.ps.slice(); used[i] = true;
      pts.forEach(function (b, j) { if (!used[j] && Math.hypot(a.x - b.x, a.y - b.y) < R) { members = members.concat(b.ps); used[j] = true; } });
      out.push(makeGroup(members, members.length > 1 ? 'cluster' : 'single'));
    });
    clusterZoom = z;
    return out;
  }

  function makeGroup(ps, kind) {
    ps = ps.slice().sort(function (a, b) { return b.year - a.year; });
    var lng = 0, lat = 0;
    ps.forEach(function (p) { lng += p.lng; lat += p.lat; });
    return { id: kind + ':' + ps.map(function (p) { return p.id; }).join('|'), kind: kind, projects: ps, lng: lng / ps.length, lat: lat / ps.length };
  }

  function city(p) { return T.field(p, 'city').split(' · ')[0]; }
  function district(p) { var s = T.field(p, 'city').split(' · '); return s[1] || s[0]; }
  function commonRegion(ps) {
    var best = null;
    ['jjj', 'yrd', 'gba'].forEach(function (r) { if (ps.every(function (p) { return inRegion(p, r); })) best = r; });
    if (!best && ps.every(function (p) { return inRegion(p, 'china'); })) best = 'china';
    return best;
  }
  function groupLabel(g) {
    var ps = g.projects;
    if (g.kind === 'country') return T.field(ps[0], 'country');
    if (ps.length === 1) return g.useDistrict ? district(ps[0]) : city(ps[0]);
    var cities = Array.from(new Set(ps.map(city)));
    if (cities.length === 1) return cities[0];
    var r = commonRegion(ps);
    if (r) return T.t('map.region.' + r);
    return cities[0] + ' / ' + cities[1] + (cities.length > 2 ? ' …' : '');
  }

  /* ---- Markers (svg) ------------------------------------------------------ */
  function badgeR(g) { return (8.5 + Math.min(6, Math.sqrt(g.projects.length - 1) * 1.6)) * markScale(); }

  function markShape(node, g) {
    var s = markScale();
    el('circle', { 'class': 'hit', r: mqFine.matches ? 16 : 22 }, node);        // ≥44px tap target on touch
    if (g.projects.length > 1) {
      var b = el('g', { 'class': 'mk-badge dot' }, node);
      el('circle', { r: badgeR(g) }, b);
      var t = el('text', { y: 0.36 * labelSize() * 0.95 }, b);
      t.textContent = g.projects.length;
    } else {
      el('circle', { 'class': 'dot', r: 3.8 * s }, node);
    }
  }

  function renderMarks(animate) {
    var keep = {};
    groups.forEach(function (g) { keep[g.id] = true; });
    Array.prototype.slice.call(gMarks.children).forEach(function (n) {
      if (keep[n.__g.id]) return;
      if (!animate) { n.remove(); return; }
      n.classList.add('is-out'); n.style.pointerEvents = 'none';
      setTimeout(function () { n.remove(); }, 260);
    });
    var existing = {};
    Array.prototype.slice.call(gMarks.children).forEach(function (n) { if (!n.classList.contains('is-out')) existing[n.__g.id] = n; });
    groups.forEach(function (g) {
      var n = existing[g.id];
      if (n) { n.__g = g; return; }
      n = el('g', { 'class': 'mk' + (animate ? ' is-new' : ''), role: 'button', tabindex: 0 }, gMarks);
      n.__g = g;
      markShape(n, g);
      if (animate) requestAnimationFrame(function () { requestAnimationFrame(function () { n.classList.remove('is-new'); }); });
    });
    Array.prototype.slice.call(gMarks.children).forEach(function (n) {
      if (!n.classList.contains('is-out')) n.setAttribute('aria-label', groupLabel(n.__g) + (n.__g.projects.length > 1 ? ' · ' + n.__g.projects.length : ''));
    });
    positionAll();
  }

  gMarks.addEventListener('click', function (e) {
    var n = e.target.closest('.mk'); if (!n) return;
    e.stopPropagation(); onMarkClick(n.__g);
  });
  gMarks.addEventListener('keydown', function (e) {
    var n = e.target.closest('.mk'); if (!n) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarkClick(n.__g, true); }
  });
  gMarks.addEventListener('mouseover', function (e) {
    var n = e.target.closest('.mk'); if (!n || !mqFine.matches || (map && map.isMoving())) return;
    showCard(n.__g, false);
  });
  gMarks.addEventListener('mouseout', function (e) {
    var n = e.target.closest('.mk'); if (!n || !mqFine.matches || n.contains(e.relatedTarget)) return;
    if (!pinned) hideCardSoon();
  });

  function positionAll() {
    if (!map) return;
    Array.prototype.slice.call(gMarks.children).forEach(function (n) {
      var g = n.__g, xy = project(g.lng, g.lat);
      g.x = xy.x; g.y = xy.y;
      n.setAttribute('transform', 'translate(' + xy.x.toFixed(1) + ',' + xy.y.toFixed(1) + ')');
    });
    Array.prototype.slice.call(gLabels.children).forEach(function (n) {
      var g = n.__g; if (g.x === undefined) return;
      n.setAttribute('transform', 'translate(' + g.x.toFixed(1) + ',' + g.y.toFixed(1) + ')');
    });
    if (card.__g && !card.hidden && !mqCompact.matches) placeCard(card.__g);
  }

  /* ---- Labels with hairline leaders + collision avoidance ----------------- */
  function textWidth(s, size, weight) {
    measureCtx.font = (weight || 500) + ' ' + size + 'px ' + getComputedStyle(document.body).fontFamily;
    return measureCtx.measureText(s).width;
  }
  function hits(b, list, m) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (b.x0 < o.x1 + m && b.x1 > o.x0 - m && b.y0 < o.y1 + m && b.y1 > o.y0 - m) return true;
    }
    return false;
  }
  function uiRects() {
    return [mqCompact.matches ? toggle : filters, section.querySelector('.map-count'), section.querySelector('.map-credit'),
      section.querySelector('.map-zoom'), section.querySelector('.map-hint')].filter(visible).map(rel);
  }

  function renderLabels(fade) {
    while (gLabels.firstChild) gLabels.firstChild.remove();
    labelsShown = true;
    var gs = groups.filter(function (g) { return g.x > -40 && g.x < W + 40 && g.y > -40 && g.y < H + 40; });
    if (!gs.length) return;
    var fs = labelSize(), sc = markScale();
    var counts = {};
    gs.forEach(function (g) { g.useDistrict = false; var l = groupLabel(g); counts[l] = (counts[l] || 0) + 1; });
    gs.forEach(function (g) { if (g.projects.length === 1 && counts[groupLabel(g)] > 1) g.useDistrict = true; });
    var placed = gs.map(function (g) { var r = g.projects.length > 1 ? badgeR(g) + 1 : 6 * sc; return { x0: g.x - r, y0: g.y - r, x1: g.x + r, y1: g.y + r }; });
    var nMarks = placed.length, avoid = uiRects();
    gs.slice().sort(function (a, b) { return b.projects.length - a.projects.length || a.y - b.y; }).forEach(function (g) {
      var name = groupLabel(g), n = '';
      var w = textWidth(name, fs, 500), h = fs * 1.15;
      var cands = [];
      if (g.projects.length > 1) {
        var s = badgeR(g) + 6, d = s * 0.72;
        cands.push({ tx: s, ty: h / 2, a: 'bl' }, { tx: -s, ty: h / 2, a: 'br' }, { tx: d, ty: -d, a: 'bl' }, { tx: d, ty: d + h, a: 'bl' },
          { tx: -d, ty: -d, a: 'br' }, { tx: -d, ty: d + h, a: 'br' });
      }
      [30, 52, 76, 100, 128].forEach(function (L) { cands.push({ L: -L * sc }, { L: L * sc }); });
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i], box, left = false;
        if (c.L !== undefined) {
          var up = c.L < 0, yEnd = c.L;
          left = g.x + 5 + w > W - 12;
          box = { x0: left ? -5 - w : 5, x1: left ? -5 : 5 + w, y0: up ? yEnd - 1 : yEnd - h, y1: up ? yEnd + h : yEnd + 1 };
        } else {
          var r2 = c.a[1] === 'r', top = c.a[0] === 't';
          box = { x0: r2 ? c.tx - w : c.tx, x1: r2 ? c.tx : c.tx + w, y0: top ? c.ty : c.ty - h, y1: top ? c.ty + h : c.ty };
        }
        var abs = { x0: g.x + box.x0, x1: g.x + box.x1, y0: g.y + box.y0, y1: g.y + box.y1 };
        if (abs.x0 < 10 || abs.x1 > W - 10 || abs.y0 < 10 || abs.y1 > H - 10) continue;
        var lead = c.L !== undefined ? { x0: g.x - 1, x1: g.x + 1, y0: g.y + Math.min(0, c.L) + 6, y1: g.y + Math.max(0, c.L) - 6 } : null;
        if (hits(abs, placed, 3) || hits(abs, avoid, 6) || (lead && (hits(lead, placed.slice(nMarks), 1) || hits(lead, avoid, 2)))) continue;
        placed.push(abs);
        drawLabel(g, name, n, c, box);
        break;
      }
    });
    gLabels.classList.toggle('is-hidden', !!fade);
    if (fade) requestAnimationFrame(function () { requestAnimationFrame(function () { gLabels.classList.remove('is-hidden'); }); });
  }

  function drawLabel(g, name, n, c, box) {
    var lb = el('g', { 'class': 'lb' + (g.projects.length > 1 ? ' is-group' : '') }, gLabels);
    lb.__g = g;
    lb.setAttribute('transform', 'translate(' + g.x.toFixed(1) + ',' + g.y.toFixed(1) + ')');
    if (c.L !== undefined) el('line', { x1: 0, x2: 0, y1: c.L < 0 ? -6 : 6, y2: c.L }, lb);
    var tx = el('text', { x: box.x0, y: box.y1 - 2.5 }, lb);
    var t1 = el('tspan', {}, tx); t1.textContent = name;
    if (n) { var t2 = el('tspan', { 'class': 'n', dx: 6 }, tx); t2.textContent = n; }
  }
  function hideLabels() { if (labelsShown) { gLabels.classList.add('is-hidden'); labelsShown = false; } }

  /* ---- Card --------------------------------------------------------------- */
  var hideTimer = null, pinned = false;
  card.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
  card.addEventListener('mouseleave', function () { if (!pinned) hideCardSoon(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hideCard(); setPanel(false); } });

  function href(p) { return 'project.html?id=' + encodeURIComponent(p.id); }

  function showCard(g, pin) {
    clearTimeout(hideTimer);
    pinned = !!pin;
    Array.prototype.slice.call(gMarks.children).forEach(function (n) { n.classList.toggle('is-hover', n.__g === g); });
    var ps = g.projects, html;
    if (ps.length === 1) {
      var p = ps[0];
      html = '<p class="k"><span>' + T.esc(T.t('service.' + p.service)) + '</span><span class="yr">' + p.year + '</span></p>' +
        '<h3><a href="' + href(p) + '">' + T.esc(T.field(p, 'name')) + '</a></h3>' +
        '<p class="meta">' + T.esc(T.field(p, 'city')) + '</p>' +
        '<a class="go" href="' + href(p) + '">' + T.esc(T.t('map.view')) + ' <span aria-hidden="true">→</span></a>';
    } else {
      html = '<p class="k"><span>' + T.esc(groupLabel(g)) + '</span><span class="yr">' + T.esc(T.t('map.count', { n: ps.length })) + '</span></p><ul>' +
        ps.slice(0, 6).map(function (p) {
          return '<li><a href="' + href(p) + '"><span>' + T.esc(T.field(p, 'name')) + '<small>' + T.esc(T.t('service.' + p.service)) + '</small></span><span class="yr">' + p.year + '</span></a></li>';
        }).join('') + '</ul>' +
        (ps.length > 6 ? '<p class="meta more">' + T.esc(T.t('map.more', { n: ps.length - 6 })) + '</p>' : '') +
        (canZoom(g) ? '<button type="button" class="zoom">' + T.esc(T.t('map.zoom')) + ' <span aria-hidden="true">→</span></button>' : '');
    }
    if (pinned || !mqFine.matches) html += '<button type="button" class="map-card-close" aria-label="Close">×</button>';
    card.innerHTML = html;
    card.__g = g;
    card.hidden = false;
    var zb = card.querySelector('.zoom');
    if (zb) zb.addEventListener('click', function (e) { e.stopPropagation(); zoomToGroup(g, true); });
    var cb = card.querySelector('.map-card-close');
    if (cb) cb.addEventListener('click', function (e) { e.stopPropagation(); hideCard(); });
    if (mqCompact.matches) { card.style.left = ''; card.style.top = ''; } else placeCard(g);
    requestAnimationFrame(function () { card.classList.add('is-on'); });
  }
  function placeCard(g) {
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var x = g.x + 20, y = g.y - ch / 2;
    if (x + cw > W - 16) x = g.x - 20 - cw;
    x = Math.max(16, x); y = Math.max(16, Math.min(H - ch - 16, y));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  function hideCardSoon() { clearTimeout(hideTimer); hideTimer = setTimeout(hideCard, 220); }
  function hideCard() {
    pinned = false; card.classList.remove('is-on'); card.__g = null;
    Array.prototype.slice.call(gMarks.children).forEach(function (n) { n.classList.remove('is-hover'); });
    setTimeout(function () { if (!card.classList.contains('is-on')) card.hidden = true; }, 220);
  }

  /* ---- Cluster expansion -------------------------------------------------- */
  function membersBounds(ps) {
    var c = map.getCenter().lng, w = 180, s = 90, e = -180, n = -90;
    ps.forEach(function (p) {
      var lng = p.lng + 360 * Math.round((c - p.lng) / 360);
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    });
    var pad = Math.max(0.01, (e - w) * 0.04);   // a little air, and a minimum span for co-located projects
    return [[w - pad, s - pad], [e + pad, n + pad]];
  }
  function groupCamera(g) {
    var best = null, b = membersBounds(g.projects);
    paddings().forEach(function (pad) {
      var cam = fitBounds(b, pad);
      if (!best || cam.zoom > best.zoom) best = cam;
    });
    return best;
  }
  function canZoom(g) { return g.projects.length > 1 && groupCamera(g).zoom > map.getZoom() + 0.35; }

  function zoomToGroup(g, fromCard) {
    hideCard();
    var ps = g.projects;
    var cities = Array.from(new Set(ps.map(function (p) { return p.city_en.split(' · ')[0]; })));
    var r = cities.length > 1 ? commonRegion(ps) : null;
    if (g.kind === 'country' && ps[0].country === 'CN') r = 'china';
    // a cluster that *is* a filter region (e.g. "京津冀城市群 14" in the China view) selects it;
    // a city cluster (Beijing, Shenzhen …) just zooms in — cities are not filter items
    if (r && DEPTH[r] > DEPTH[state.region]) { setRegion(r); return; }
    if (canZoom(g)) { fly(groupCamera(g)); return; }
    if (!fromCard) showCard(g, true);
  }

  function onMarkClick(g, keyboard) {
    setPanel(false);
    if (g.projects.length > 1) { zoomToGroup(g); return; }
    // mouse: a dot opens the project (the card already showed on hover);
    // touch / keyboard: first tap opens the card, which holds the link
    if (mqFine.matches && !keyboard) { location.href = href(g.projects[0]); return; }
    showCard(g, true);
  }

  /* ---- Controls ----------------------------------------------------------- */
  function setPanel(open) {
    filters.classList.toggle('is-open', !!open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) hideCard();
  }
  toggle.addEventListener('click', function (e) { e.stopPropagation(); setPanel(!filters.classList.contains('is-open')); });

  function renderControls() {
    section.querySelector('.map-regions').innerHTML = T.SITE.regions.map(function (r) {
      return '<li><button type="button" data-region="' + r.key + '">' + T.esc(T.t('map.region.' + r.key)) +
        (r.abbr ? '<span class="abbr">' + r.abbr + '</span>' : '') + '</button></li>';
    }).join('');
    section.querySelector('.map-years').innerHTML = T.SITE.years.map(function (y) {
      return '<li><button type="button" data-year="' + y + '">' + (y === 'all' ? T.esc(T.t('map.year.all')) : y) + '</button></li>';
    }).join('');
    var zi = section.querySelector('.map-zoom-in'), zo = section.querySelector('.map-zoom-out');
    zi.setAttribute('aria-label', T.t('map.zoomin')); zo.setAttribute('aria-label', T.t('map.zoomout'));
    var hint = section.querySelector('.map-hint');
    hint.textContent = T.t(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'map.hint.mac' : 'map.hint.pc');
    syncControls();
  }

  function syncControls() {
    section.querySelectorAll('[data-region]').forEach(function (b) {
      var on = b.getAttribute('data-region') === state.region;
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
    });
    section.querySelectorAll('[data-year]').forEach(function (b) {
      var on = b.getAttribute('data-year') === String(state.year);
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
    });
    toggle.querySelector('.sum').textContent = T.t('map.region.' + state.region) + ' · ' + (state.year === 'all' ? T.t('map.year.all') : state.year);
    var n = projects.filter(function (p) { return yearOk(p) && inRegion(p, state.region); }).length;
    var sample = projects.some(function (p) { return p.example; });
    section.querySelector('.map-count').innerHTML = '<b>' + T.esc(T.t('map.count', { n: n })) + '</b>' +
      (sample ? '<span class="tag">' + T.esc(T.t('map.sample')) + '</span>' : '');
    var empty = section.querySelector('.map-empty');
    if (!n) {
      if (!empty) { empty = document.createElement('p'); empty.className = 'map-empty'; section.appendChild(empty); }
      empty.textContent = T.t('map.empty');
    } else if (empty) empty.remove();
  }

  section.addEventListener('click', function (e) {
    var b = e.target.closest('.map-filter-cols button');
    if (!b) {
      if (!card.contains(e.target) && !filters.contains(e.target)) { if (pinned || !mqFine.matches) hideCard(); setPanel(false); }
      return;
    }
    if (b.dataset.region) { setPanel(false); setRegion(b.dataset.region); }
    if (b.dataset.year) { state.year = b.dataset.year === 'all' ? 'all' : +b.dataset.year; setPanel(false); refresh(); }
  });
  section.querySelector('.map-zoom-in').addEventListener('click', function (e) { e.stopPropagation(); map && map.zoomIn({ duration: mqReduce.matches ? 0 : 350 }); });
  section.querySelector('.map-zoom-out').addEventListener('click', function (e) { e.stopPropagation(); map && map.zoomOut({ duration: mqReduce.matches ? 0 : 350 }); });

  function setRegion(r) {
    r = REGION_ALIAS[r] || r;
    if (!DEPTH.hasOwnProperty(r)) return;
    hideCard();
    state.region = r;
    syncControls();
    if (map) fly(regionCamera(r));
  }

  function refresh() {
    hideCard();
    syncControls();
    groups = buildGroups();
    renderMarks(true);
    renderLabels(true);
  }

  /* ---- Map events: markers follow every frame, re-cluster as the zoom changes ---- */
  function onMove() {
    if (Math.abs(map.getZoom() - clusterZoom) > 0.45) {
      hideLabels();
      groups = buildGroups();
      renderMarks(true);
    } else positionAll();
  }
  function onMoveEnd() {
    groups = buildGroups();
    renderMarks(true);
    renderLabels(true);
  }

  /* ---- Size changes -------------------------------------------------------
     The GL canvas and the SVG are sized in px together with their backing stores and
     re-rendered synchronously in the ResizeObserver callback (before paint), so no frame
     ever shows a scaled bitmap. The camera re-frames (debounced) only on real changes:
     width / rotation / window resize; mobile URL-bar height jitter keeps the camera. */
  var fitW = 0, fitH = 0, rt = null;
  function syncSize() {
    var r = section.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  function onSizeChange() {
    var r = section.getBoundingClientRect();
    if (Math.round(r.width) === W && Math.round(r.height) === H) return;
    syncSize();
    if (!map) return;
    map.resize(); map.redraw();
    positionAll();
    clearTimeout(rt);
    rt = setTimeout(function () {
      var dw = Math.abs(W - fitW), dh = Math.abs(H - fitH);
      if (!mqFine.matches && dw < 2 && dh < fitH * 0.25) { renderLabels(false); return; }
      if (dw < 2 && dh < 2) return;
      refit();
    }, 160);
  }
  function refit() {
    fitW = W; fitH = H;
    setPanel(false); hideCard();
    var cam = regionCamera(state.region);
    map.setMinZoom(Math.max(0, globalCamera(paddings()[0]).zoom - 0.6));
    map.jumpTo(cam);
    onMoveEnd();
  }

  /* ---- Boot --------------------------------------------------------------- */
  function fail(msg) {
    var p = document.createElement('p'); p.className = 'map-empty'; p.textContent = msg;
    section.appendChild(p);
  }

  function boot(res) {
    projects = res[0]; overlay = res[1];
    renderControls();
    syncSize();
    if (!window.maplibregl || !window.pmtiles) return fail('Map library failed to load.');
    var protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    var qr = new URLSearchParams(location.search).get('region');
    if (qr) { qr = qr.toLowerCase(); qr = REGION_ALIAS[qr] || qr; }
    if (qr && DEPTH.hasOwnProperty(qr)) state.region = qr;
    var cam0 = regionCamera(state.region);
    try {
      map = new maplibregl.Map({
        container: glEl, style: buildStyle(),
        center: cam0.center, zoom: cam0.zoom,
        minZoom: Math.max(0, globalCamera(paddings()[0]).zoom - 0.6), maxZoom: MAX_ZOOM,
        renderWorldCopies: true, attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, boxZoom: false,
        cooperativeGestures: true,          // desktop: ⌘/Ctrl + scroll to zoom · touch: two fingers to pan
        trackResize: false,                  // resized synchronously by onSizeChange()
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        fadeDuration: 180,
        localIdeographFontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': T.t('map.hint.pc'),
          'CooperativeGesturesHandler.MacHelpText': T.t('map.hint.mac'),
          'CooperativeGesturesHandler.MobileHelpText': T.t('map.hint.touch')
        }
      });
    } catch (e) {
      console.warn('[TEKUMA map] WebGL unavailable', e);
      return fail(T.t('map.nowebgl'));
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation && map.keyboard.disableRotation();
    fitW = W; fitH = H;
    map.on('move', onMove);
    map.on('moveend', onMoveEnd);
    map.on('movestart', function (e) { if (!pinned && card.__g) hideCard(); if (!e.originalEvent || e.originalEvent.type === 'wheel' || (e.originalEvent.touches && e.originalEvent.touches.length > 1)) hideLabels(); });
    map.on('dragstart', function () { hideCard(); setPanel(false); });
    map.on('load', function () { section.classList.add('is-ready'); onMoveEnd(); });
    groups = buildGroups(); renderMarks(false);
    if (window.ResizeObserver) new ResizeObserver(onSizeChange).observe(section);
    else window.addEventListener('resize', onSizeChange);
  }

  // Lazy start: the map engine (~270 KB gz) and its data load only when the map section comes
  // near the viewport (or shortly after the page has loaded), so P1 paints with HTML/CSS/fonts only.
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadCSS(href) {
    return new Promise(function (res) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res;
      document.head.insertBefore(l, document.querySelector('link[rel=stylesheet]'));   // before style.css so site rules win
    });
  }
  var started = false;
  function start() {
    if (started) return; started = true;
    Promise.all([
      T.loadProjects(),
      fetch('data/geo/overlay.json').then(function (r) { return r.json(); }),
      window.maplibregl ? null : loadScript('vendor/maplibre-gl.js'),
      window.pmtiles ? null : loadScript('vendor/pmtiles.js'),
      loadCSS('vendor/maplibre-gl.css')
    ])
      .then(function (res) { boot(res.slice(0, 2)); })
      .catch(function (err) { console.error('[TEKUMA map]', err); fail('Map failed to load — please serve the site over http (see README).'); });
  }
  if (location.hash === '#map' || /[?&]region=/.test(location.search) || !window.IntersectionObserver) start();
  else {
    new IntersectionObserver(function (es, io) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } },
      { rootMargin: '0px' }).observe(section);
    window.addEventListener('load', function () { setTimeout(start, 1200); });
  }

  document.addEventListener('tekuma:lang', function () {
    if (!map) return;
    hideCard();
    renderControls();
    TILES.forEach(function (t) { if (map.getLayer(t.id + '-places')) map.setLayoutProperty(t.id + '-places', 'text-field', nameExpr()); });
    var screen = glEl.querySelector('.maplibregl-cooperative-gesture-screen');
    if (screen) {
      var d = screen.querySelector('.maplibregl-desktop-message'), m = screen.querySelector('.maplibregl-mobile-message');
      if (d) d.textContent = T.t(/Mac/.test(navigator.platform) ? 'map.hint.mac' : 'map.hint.pc');
      if (m) m.textContent = T.t('map.hint.touch');
    }
    refit();
  });

  // exposed for debugging / automated tests
  window.TEKUMA_MAP = {
    setRegion: setRegion, state: state,
    map: function () { return map; },
    size: function () { return [W, H]; },
    regionBounds: function (r) { return overlay && overlay.regions[r || state.region]; },
    bounds: function () {   // screen box of the current region's bounds
      var b = overlay.regions[state.region]; if (!b || !map) return null;
      var a = map.project(b[0]), c = map.project(b[1]);
      return [[Math.min(a.x, c.x), Math.min(a.y, c.y)], [Math.max(a.x, c.x), Math.max(a.y, c.y)]];
    },
    groups: function () { return groups; }
  };
})();
