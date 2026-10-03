/* ==========================================================================
   TEKUMA · Project map (P2)
   D3 + TopoJSON. Basemap on <canvas>, markers & labels in an <svg> overlay.
   Data:  data/projects.json  ·  data/geo/*.json (vendored, see scripts/build-geo.sh)
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TEKUMA;

  /* ---- Look & behaviour (safe to tweak) ---------------------------------- */
  var STYLE = {
    land: '#EFEFEF',        // world land
    china: '#E3E3E3',       // China (official DataV boundary)
    active: '#D6D6D6',      // provinces / cities that are in focus
    focus: '#E0E0E0',       // city cluster in focus (JJJ / YRD / GBA / Beijing)
    border: '#FFFFFF',      // province & city borders
    outline: '#D2D2D2',     // China national boundary hairline
    dash: '#B4B4B4',        // South China Sea nine-dash line
    leader: '#A3A3A3'
  };
  var GLOBAL_CENTER = 150;  // central meridian of the world view (150°E, as on Chinese standard world maps)
  var GLOBAL_LAT = [-50, 76];
  var DEPTH = { global: 0, china: 1, jjj: 2, yrd: 2, gba: 2, beijing: 3 };
  var CLUSTER_PX = 22;      // markers closer than this (px) merge into one group

  /* ---- State ------------------------------------------------------------- */
  var section = document.getElementById('map');
  if (!section) return;
  var canvas = section.querySelector('.map-canvas');
  var ctx = canvas.getContext('2d');
  var svg = d3.select(section.querySelector('.map-overlay'));
  var gLabels = svg.append('g').attr('class', 'labels');
  var gMarks = svg.append('g').attr('class', 'marks');
  var card = section.querySelector('.map-card');
  var hoverCapable = window.matchMedia('(hover: hover)').matches;

  var W = 0, H = 0, DPR = 1;
  var geo = {};            // land, provinces, provMesh, nineDash, cities, cityMesh
  var projects = [];
  var state = { region: 'global', year: 'all', services: new Set(T.SITE.services.map(function (s) { return s.key; })) };
  var view = null;          // current camera {rot, lng, lat, k, cx, cy}
  var focus = { region: 'global', t: 1, prev: null };
  var groups = [];
  var anim = null;
  var measureCtx = document.createElement('canvas').getContext('2d');

  /* ---- Projection / camera ------------------------------------------------ */
  function projectionFor(v) {
    var p = d3.geoNaturalEarth1().rotate([-v.rot, 0]).scale(v.k).translate([0, 0]).precision(0.4);
    var c = p([v.lng, v.lat]);
    return p.translate([v.cx - c[0], v.cy - c[1]]);
  }

  function padding() {
    var mobile = W < 760;
    if (mobile) return { t: 150, r: 20, b: 96, l: 20 };
    var ui = section.querySelector('.map-filters').getBoundingClientRect();
    return { t: 110, r: 64, b: 70, l: Math.min(ui.width + 72, W * 0.28) };
  }

  function regionGeo(key) {
    if (key === 'global') {
      var c = GLOBAL_CENTER, pts = [];
      for (var i = -179; i <= 179; i += 2) { pts.push([c + i, GLOBAL_LAT[0]], [c + i, GLOBAL_LAT[1]]); }
      return { type: 'MultiPoint', coordinates: pts };
    }
    if (key === 'china') return { type: 'FeatureCollection', features: geo.provinces.features.concat(geo.nineDash.features) };
    return { type: 'FeatureCollection', features: geo.cities.features.filter(function (f) { return f.properties.tags.indexOf(key) > -1; }) };
  }

  function fitView(key) {
    var g = regionGeo(key);
    var rot = key === 'global' ? GLOBAL_CENTER : d3.geoCentroid(g)[0];
    var pad = padding();
    var aw = W - pad.l - pad.r, ah = H - pad.t - pad.b;
    var p = d3.geoNaturalEarth1().rotate([-rot, 0]).scale(1).translate([0, 0]);
    var b = d3.geoPath(p).bounds(g);
    var k = Math.min(aw / (b[1][0] - b[0][0]), ah / (b[1][1] - b[0][1]));
    if (key === 'global') k = Math.min(k, W / (b[1][0] - b[0][0]) * 0.98);
    var ll = p.invert([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    if (key === 'global' && W < 760) { k *= 2.1; ll = [92, 26]; }   // portrait phones: crop the world around Asia (drag to pan)
    return { rot: rot, lng: ll[0], lat: ll[1], k: k, cx: pad.l + aw / 2, cy: pad.t + ah / 2 };
  }

  function lerpAngle(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }

  function flyTo(target, done) {
    if (anim) anim.stop();
    var v0 = view;
    // van Wijk & Nuij smooth zoom in a planar reference space (unit projection around target meridian)
    var P = d3.geoNaturalEarth1().rotate([-target.rot, 0]).scale(1).translate([0, 0]);
    var a = P([v0.lng, v0.lat]), b = P([target.lng, target.lat]);
    var iz = d3.interpolateZoom([a[0], a[1], W / v0.k], [b[0], b[1], W / target.k]);
    var duration = Math.max(900, Math.min(2400, iz.duration * 0.9));
    var rot0 = v0.rot, cx0 = v0.cx, cy0 = v0.cy;
    anim = d3.timer(function (elapsed) {
      var t = Math.min(1, elapsed / duration), e = d3.easeCubicInOut(t);
      var z = iz(e), ll = P.invert([z[0], z[1]]);
      view = {
        rot: lerpAngle(rot0, target.rot, e), lng: ll[0], lat: ll[1], k: W / z[2],
        cx: cx0 + (target.cx - cx0) * e, cy: cy0 + (target.cy - cy0) * e
      };
      focus.t = e;
      draw();
      if (t >= 1) { anim.stop(); anim = null; view = target; focus.t = 1; draw(); if (done) done(); }
    });
  }

  /* ---- Basemap (canvas) --------------------------------------------------- */
  function resizeCanvas() {
    var r = section.getBoundingClientRect();
    W = r.width; H = r.height; DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);
  }

  function focusAlpha(region) {
    if (focus.region === region) return focus.t;
    if (focus.prev === region) return 1 - focus.t;
    return 0;
  }

  function draw() {
    if (!view) return;
    var proj = projectionFor(view);
    var path = d3.geoPath(proj, ctx);
    var chinaK = geo.chinaK || view.k;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath(); path(geo.land); ctx.fillStyle = STYLE.land; ctx.fill();
    // in city-cluster views everything outside the focus recedes towards the land colour
    var deep = Math.min(1, focusAlpha('jjj') + focusAlpha('yrd') + focusAlpha('gba') + focusAlpha('beijing'));
    ctx.beginPath(); path(geo.provinces); ctx.fillStyle = d3.interpolateRgb(STYLE.china, STYLE.land)(deep * 0.75); ctx.fill();

    // provinces with projects (China view)
    var ac = focusAlpha('china');
    if (ac > 0 && geo.activeProvinces) {
      ctx.globalAlpha = ac; ctx.beginPath(); path(geo.activeProvinces); ctx.fillStyle = STYLE.active; ctx.fill(); ctx.globalAlpha = 1;
    }
    // focused city cluster (JJJ / YRD / GBA / Beijing)
    ['jjj', 'yrd', 'gba', 'beijing'].forEach(function (r) {
      var a = focusAlpha(r);
      if (a <= 0) return;
      ctx.globalAlpha = a; ctx.beginPath(); path(geo.regionShapes[r]); ctx.fillStyle = STYLE.focus; ctx.fill(); ctx.globalAlpha = 1;
    });

    // city / district borders fade in when zoomed in
    var cityA = Math.max(0, Math.min(1, (view.k / chinaK - 2.2) / 2));
    if (cityA > 0) {
      ctx.globalAlpha = cityA; ctx.beginPath(); path(geo.cityMesh);
      ctx.strokeStyle = STYLE.border; ctx.lineWidth = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    }
    var provW = Math.max(0.35, Math.min(1, view.k / chinaK * 0.8));
    ctx.beginPath(); path(geo.provMesh); ctx.strokeStyle = STYLE.border; ctx.lineWidth = provW; ctx.stroke();

    // national boundary (official DataV outline) as a faint hairline, so small islands stay visible
    ctx.beginPath(); path(geo.chinaOutline); ctx.strokeStyle = STYLE.outline; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); path(geo.nineDash); ctx.fillStyle = STYLE.dash; ctx.fill();
    ctx.strokeStyle = STYLE.dash; ctx.lineWidth = 0.9; ctx.stroke();

    positionMarks(proj);
  }

  /* ---- Projects: filter + grouping ---------------------------------------- */
  function inRegion(p, r) { return r === 'global' || (p.regions || []).indexOf(r) > -1; }
  function visibleProjects(region) {
    return projects.filter(function (p) {
      return inRegion(p, region || state.region) &&
        (state.year === 'all' || +p.year === +state.year) &&
        state.services.has(p.service);
    });
  }

  function buildGroups(v, region) {
    var proj = projectionFor(v);
    var list = visibleProjects(region);
    var out = [];
    if (region === 'global') {   // world view: countries with ≥3 projects collapse into one marker
      var byC = d3.group(list, function (p) { return p.country || p.country_en; });
      byC.forEach(function (ps, c) {
        if (ps.length >= 3) { out.push(makeGroup(ps, 'country')); list = list.filter(function (p) { return ps.indexOf(p) < 0; }); }
      });
    }
    // greedy pixel clustering for the rest
    var pts = list.map(function (p) { var xy = proj([p.lng, p.lat]); return { p: p, x: xy[0], y: xy[1] }; });
    var used = new Set();
    pts.forEach(function (a, i) {
      if (used.has(i)) return;
      var members = [a.p]; used.add(i);
      pts.forEach(function (b, j) {
        if (!used.has(j) && Math.hypot(a.x - b.x, a.y - b.y) < CLUSTER_PX) { members.push(b.p); used.add(j); }
      });
      out.push(makeGroup(members, 'city'));
    });
    return out;
  }

  function makeGroup(ps, kind) {
    ps = ps.slice().sort(function (a, b) { return b.year - a.year; });
    return {
      id: kind + ':' + ps.map(function (p) { return p.id; }).join('|'),
      kind: kind, projects: ps,
      lng: d3.mean(ps, function (p) { return p.lng; }),
      lat: d3.mean(ps, function (p) { return p.lat; })
    };
  }

  function groupLabel(g) {
    var ps = g.projects;
    if (g.kind === 'country') return T.field(ps[0], 'country');
    if (ps.length === 1) return g.useName ? T.field(ps[0], 'name').replace(/^.*·\s*/, '') : shortCity(ps[0]);
    var r = deeperRegion(g);              // e.g. a cluster in the China view -> "京津冀城市群"
    if (r) return T.t('map.region.' + r);
    var cities = Array.from(new Set(ps.map(shortCity)));
    return cities.length === 1 ? cities[0] : cities[0] + ' / ' + cities[1] + (cities.length > 2 ? ' …' : '');
  }
  function shortCity(p) { return T.field(p, 'city').split(' · ')[0]; }

  function deeperRegion(g) {
    var cur = DEPTH[state.region], best = null;
    ['china', 'jjj', 'yrd', 'gba', 'beijing'].forEach(function (r) {
      if (DEPTH[r] > cur && g.projects.every(function (p) { return inRegion(p, r); })) {
        if (!best || DEPTH[r] > DEPTH[best]) best = r;   // deepest region that contains all members
      }
    });
    return best;
  }

  /* ---- Markers (svg) ------------------------------------------------------ */
  function markShape(sel, g) {
    sel.selectAll('*').remove();
    sel.append('circle').attr('class', 'hit').attr('r', 13);
    if (g.projects.length > 1) {
      var s = 9 + Math.min(10, Math.sqrt(g.projects.length) * 3);
      var c = sel.append('g').attr('class', 'mk-cross dot');
      c.append('line').attr('x1', -s).attr('x2', s);
      c.append('line').attr('y1', -s).attr('y2', s);
      c.append('circle').attr('r', 2.2).attr('fill', 'var(--red)');
    } else {
      var sv = T.service(g.projects[0].service);
      var dot = sel.append('circle').attr('class', 'dot').attr('r', sv.mark === 'ring' ? 3.4 : 3.8);
      if (sv.mark === 'ring') dot.attr('fill', '#fff').attr('stroke', sv.color).attr('stroke-width', 1.4);
      else dot.attr('fill', sv.color);
    }
  }

  function renderMarks() {
    var sel = gMarks.selectAll('g.mk').data(groups, function (g) { return g.id; });
    sel.exit().transition().duration(250).style('opacity', 0).remove();
    var enter = sel.enter().append('g').attr('class', 'mk').style('opacity', 0)
      .on('mouseenter', function (e, g) { if (hoverCapable) showCard(g, false); })
      .on('mouseleave', function () { if (hoverCapable) hideCardSoon(); })
      .on('click', function (e, g) { e.stopPropagation(); onMarkClick(g); });
    enter.each(function (g) { markShape(d3.select(this), g); });
    enter.transition().duration(400).style('opacity', 1);
    positionMarks(projectionFor(view));
  }

  function positionMarks(proj) {
    gMarks.selectAll('g.mk').attr('transform', function (g) {
      var xy = proj([g.lng, g.lat]); g.x = xy[0]; g.y = xy[1];
      return 'translate(' + xy[0].toFixed(1) + ',' + xy[1].toFixed(1) + ')';
    });
  }

  /* ---- Labels with hairline leaders + simple collision avoidance ---------- */
  function textWidth(s, size, weight) {
    measureCtx.font = (weight || 500) + ' ' + size + 'px ' + getComputedStyle(document.body).fontFamily;
    return measureCtx.measureText(s).width;
  }

  function renderLabels() {
    gLabels.selectAll('*').remove();
    if (!groups.length) return;
    // if several single markers would share a city label (e.g. Beijing view), show project names instead
    var counts = {};
    groups.forEach(function (g) { g.useName = false; var l = groupLabel(g); counts[l] = (counts[l] || 0) + 1; });
    groups.forEach(function (g) { if (g.projects.length === 1 && counts[groupLabel(g)] > 1) g.useName = true; });

    var placed = [];
    var avoid = uiRects();
    groups.forEach(function (g) { placed.push({ x0: g.x - 5, y0: g.y - 5, x1: g.x + 5, y1: g.y + 5 }); });
    var order = groups.slice().sort(function (a, b) { return b.projects.length - a.projects.length || a.y - b.y; });

    order.forEach(function (g) {
      var name = groupLabel(g), n = g.projects.length > 1 ? String(g.projects.length) : '';
      var w = textWidth(name, 11, 500) + (n ? textWidth(n, 11, 400) + 6 : 0), h = 12;
      var cands = [];
      if (g.projects.length > 1) {
        var s = 9 + Math.min(10, Math.sqrt(g.projects.length) * 3) + 4;
        cands.push({ tx: g.x + s, ty: g.y - s, anchor: 'bl' }, { tx: g.x + s, ty: g.y + s, anchor: 'tl' },
                   { tx: g.x - s, ty: g.y - s, anchor: 'br' }, { tx: g.x - s, ty: g.y + s, anchor: 'tr' });
      }
      [30, 52, 76, 100, 128].forEach(function (L) {
        cands.push({ L: -L }, { L: L });
      });
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i], box;
        if (c.L !== undefined) {
          var up = c.L < 0, yEnd = g.y + c.L;
          box = { x0: g.x + 5, x1: g.x + 5 + w, y0: up ? yEnd - 1 : yEnd - h, y1: up ? yEnd + h : yEnd + 1 };
        } else {
          var left = c.anchor[1] === 'r', top = c.anchor[0] === 't';
          box = { x0: left ? c.tx - w : c.tx, x1: left ? c.tx : c.tx + w, y0: top ? c.ty : c.ty - h, y1: top ? c.ty + h : c.ty };
        }
        if (box.x0 < 8 || box.x1 > W - 8 || box.y0 < 8 || box.y1 > H - 8) continue;
        var leaderBox = c.L !== undefined ? { x0: g.x - 1, x1: g.x + 1, y0: Math.min(g.y, g.y + c.L) + 6, y1: Math.max(g.y, g.y + c.L) - 6 } : null;
        if (hits(box, placed, 3) || hits(box, avoid, 6) || (leaderBox && hits(leaderBox, placed.slice(groups.length), 1))) continue;
        placed.push(box);
        drawLabel(g, name, n, c, box);
        return;
      }
    });
    gLabels.style('opacity', 0).transition().duration(450).style('opacity', 1);
  }

  function drawLabel(g, name, n, c, box) {
    var lb = gLabels.append('g').attr('class', 'lb' + (g.projects.length > 1 ? ' is-group' : ''));
    if (c.L !== undefined) {
      lb.append('line').attr('x1', g.x).attr('x2', g.x)
        .attr('y1', g.y + (c.L < 0 ? -5 : 5)).attr('y2', g.y + c.L);
    }
    var tx = lb.append('text').attr('x', box.x0).attr('y', box.y1 - 2);
    tx.append('tspan').text(name);
    if (n) tx.append('tspan').attr('class', 'n').attr('dx', 6).text(n);
  }

  function hits(b, list, m) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (b.x0 < o.x1 + m && b.x1 > o.x0 - m && b.y0 < o.y1 + m && b.y1 > o.y0 - m) return true;
    }
    return false;
  }

  function uiRects() {
    var base = section.getBoundingClientRect();
    return Array.prototype.map.call(section.querySelectorAll('.map-filters, .map-legend, .map-foot p'), function (el) {
      var r = el.getBoundingClientRect();
      return { x0: r.left - base.left, x1: r.right - base.left, y0: r.top - base.top, y1: r.bottom - base.top };
    });
  }

  /* ---- Card --------------------------------------------------------------- */
  var hideTimer = null, pinned = false;
  card.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
  card.addEventListener('mouseleave', function () { if (!pinned) hideCardSoon(); });

  function legendSwatch(key, size) {
    var s = T.service(key), r = size || 3.6;
    return '<svg width="' + (r * 2 + 2) + '" height="' + (r * 2 + 2) + '" viewBox="' + (-r - 1) + ' ' + (-r - 1) + ' ' + (r * 2 + 2) + ' ' + (r * 2 + 2) + '">' +
      (s.mark === 'ring' ? '<circle r="' + (r - .7) + '" fill="#fff" stroke="' + s.color + '" stroke-width="1.4"/>' : '<circle r="' + r + '" fill="' + s.color + '"/>') + '</svg>';
  }

  function href(p) { return 'project.html?id=' + encodeURIComponent(p.id); }

  function showCard(g, pin) {
    clearTimeout(hideTimer);
    pinned = !!pin;
    gMarks.selectAll('g.mk').classed('is-hover', function (d) { return d === g; });
    var ps = g.projects, html;
    if (ps.length === 1) {
      var p = ps[0];
      html = '<a href="' + href(p) + '">' +
        '<p class="k">' + legendSwatch(p.service) + T.esc(T.t('service.' + p.service)) + '</p>' +
        '<h3>' + T.esc(T.field(p, 'name')) + '</h3>' +
        '<p class="meta">' + T.esc(T.field(p, 'city')) + ' · ' + p.year + '</p>' +
        '<p class="go">' + T.esc(T.t('map.view')) + ' <span>→</span></p></a>';
    } else {
      var deeper = deeperRegion(g);
      html = '<p class="k">' + T.esc(groupLabel(g)) + ' · ' + T.esc(T.t('map.count', { n: ps.length })) + '</p><ul>' +
        ps.slice(0, 6).map(function (p) {
          return '<li><a href="' + href(p) + '">' + legendSwatch(p.service, 3.2) + '<span>' + T.esc(T.field(p, 'name')) + '</span><span class="yr">' + p.year + '</span></a></li>';
        }).join('') + '</ul>' +
        (ps.length > 6 ? '<p class="meta more">' + T.esc(T.t('map.more', { n: ps.length - 6 })) + '</p>' : '') +
        (deeper ? '<button type="button" class="zoom" data-region="' + deeper + '">' + T.esc(T.t('map.zoom')) + ' →</button>' : '');
    }
    card.innerHTML = html;
    card.hidden = false;
    var zb = card.querySelector('.zoom');
    if (zb) zb.addEventListener('click', function () { setRegion(zb.getAttribute('data-region')); });
    // place next to the marker, flipping near the edges
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var x = g.x + 18, y = g.y - ch / 2;
    if (x + cw > W - 16) x = g.x - 18 - cw;
    y = Math.max(16, Math.min(H - ch - 16, y));
    card.style.left = x + 'px'; card.style.top = y + 'px';
    requestAnimationFrame(function () { card.classList.add('is-on'); });
  }
  function hideCardSoon() { clearTimeout(hideTimer); hideTimer = setTimeout(hideCard, 220); }
  function hideCard() {
    pinned = false; card.classList.remove('is-on');
    gMarks.selectAll('g.mk').classed('is-hover', false);
    setTimeout(function () { if (!card.classList.contains('is-on')) card.hidden = true; }, 220);
  }
  section.addEventListener('click', function (e) { if (!card.contains(e.target)) hideCard(); });

  function onMarkClick(g) {
    var deeper = g.projects.length > 1 ? deeperRegion(g) : null;
    if (deeper) { setRegion(deeper); return; }
    if (g.projects.length === 1 && hoverCapable) { location.href = href(g.projects[0]); return; }
    showCard(g, true);
  }

  /* ---- Controls ----------------------------------------------------------- */
  function renderControls() {
    var regions = section.querySelector('.map-regions');
    regions.innerHTML = T.SITE.regions.map(function (r) {
      return '<li><button type="button" data-region="' + r.key + '">' + T.esc(T.t('map.region.' + r.key)) +
        (r.abbr ? '<span class="abbr">' + r.abbr + '</span>' : '') + '</button></li>';
    }).join('');
    var years = section.querySelector('.map-years');
    years.innerHTML = T.SITE.years.map(function (y) {
      return '<li><button type="button" data-year="' + y + '">' + (y === 'all' ? T.esc(T.t('map.year.all')) : y) + '</button></li>';
    }).join('');
    var legend = section.querySelector('.map-legend');
    legend.setAttribute('aria-label', T.t('map.legend'));
    legend.innerHTML = T.SITE.services.map(function (s) {
      return '<li><button type="button" data-service="' + s.key + '" aria-pressed="' + state.services.has(s.key) + '">' +
        legendSwatch(s.key) + T.esc(T.t('service.' + s.key)) + '</button></li>';
    }).join('');
    syncControls();
  }

  function syncControls() {
    section.querySelectorAll('[data-region]').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-region') === state.region); });
    section.querySelectorAll('[data-year]').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-year') === String(state.year)); });
    section.querySelectorAll('[data-service]').forEach(function (b) { b.setAttribute('aria-pressed', state.services.has(b.getAttribute('data-service'))); });
    var n = visibleProjects().length;
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
    var b = e.target.closest('.map-filters button, .map-legend button');
    if (!b) return;
    if (b.dataset.region) setRegion(b.dataset.region);
    if (b.dataset.year) { state.year = b.dataset.year === 'all' ? 'all' : +b.dataset.year; refresh(); }
    if (b.dataset.service) {
      // first click isolates one service; further clicks add/remove; emptying resets to all
      var k = b.dataset.service, allKeys = T.SITE.services.map(function (s) { return s.key; });
      if (state.services.size === allKeys.length) state.services = new Set([k]);
      else if (state.services.has(k)) state.services.delete(k); else state.services.add(k);
      if (!state.services.size) state.services = new Set(allKeys);
      refresh();
    }
  });

  function setRegion(r) {
    if (!DEPTH.hasOwnProperty(r)) return;
    hideCard();
    var target = home = fitView(r);
    focus.prev = state.region; focus.region = r; focus.t = 0;
    state.region = r;
    updateActiveProvinces();
    syncControls();
    gLabels.transition().duration(200).style('opacity', 0);
    groups = buildGroups(target, r);
    renderMarks();
    flyTo(target, function () { renderLabels(); });
  }

  function refresh() {
    hideCard();
    updateActiveProvinces();
    syncControls();
    groups = buildGroups(view, state.region);
    gMarks.selectAll('g.mk').remove();
    renderMarks();
    draw();
    renderLabels();
  }

  function updateActiveProvinces() {
    var list = visibleProjects('china');
    geo.activeProvinces = {
      type: 'FeatureCollection',
      features: geo.provinces.features.filter(function (f) {
        return list.some(function (p) { return d3.geoContains(f, [p.lng, p.lat]); });
      })
    };
  }

  /* ---- Drag to pan (mouse: any direction · touch: horizontal, so the page still scrolls) ---- */
  var drag = null, home = null;
  section.addEventListener('pointerdown', function (e) {
    if (!view || anim || e.button > 0 || e.target.closest('.map-filters, .map-legend, .map-card, .mk')) return;
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false, touch: e.pointerType !== 'mouse' };
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = drag.touch ? 0 : e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true; hideCard(); section.classList.add('is-dragging');
      gLabels.interrupt().style('opacity', 0);
    }
    var lim = { x: W * 0.5, y: H * 0.4 };
    view = Object.assign({}, view, {
      cx: home.cx + Math.max(-lim.x, Math.min(lim.x, drag.cx + dx - home.cx)),
      cy: home.cy + Math.max(-lim.y, Math.min(lim.y, drag.cy + dy - home.cy))
    });
    draw();
  });
  function endDrag() {
    if (drag && drag.moved) { section.classList.remove('is-dragging'); renderLabels(); }
    drag = null;
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  /* ---- Boot --------------------------------------------------------------- */
  function onResize() {
    resizeCanvas();
    geo.chinaK = fitView('china').k;
    view = home = fitView(state.region);
    groups = buildGroups(view, state.region);
    gMarks.selectAll('g.mk').remove();
    renderMarks();
    draw();
    renderLabels();
  }

  Promise.all([
    T.loadProjects(),
    d3.json('data/geo/world-land.json'),
    d3.json('data/geo/china.json'),
    d3.json('data/geo/china-cities.json'),
    document.fonts ? document.fonts.ready : Promise.resolve()
  ]).then(function (res) {
    projects = res[0];
    var world = res[1], china = res[2], cities = res[3];
    geo.land = topojson.feature(world, world.objects.land);
    geo.provinces = topojson.feature(china, china.objects.provinces);
    geo.provMesh = topojson.mesh(china, china.objects.provinces, function (a, b) { return a !== b; });
    geo.nineDash = topojson.feature(china, china.objects.nineDash);
    geo.chinaOutline = topojson.mesh(china, china.objects.provinces, function (a, b) { return a === b; });
    geo.cities = topojson.feature(cities, cities.objects.cities);
    geo.cityMesh = topojson.mesh(cities, cities.objects.cities, function (a, b) { return a !== b; });
    geo.regionShapes = {};
    ['jjj', 'yrd', 'gba', 'beijing'].forEach(function (r) {
      geo.regionShapes[r] = { type: 'FeatureCollection', features: geo.cities.features.filter(function (f) { return f.properties.tags.indexOf(r) > -1; }) };
    });
    renderControls();
    updateActiveProvinces();
    onResize();
    var lastW = W, lastH = H, rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var r = section.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 2 && Math.abs(r.height - lastH) < 80) return;  // ignore mobile URL bar
        lastW = r.width; lastH = r.height; onResize();
      }, 160);
    });
    // deep link: index.html?region=china#map
    var qr = new URLSearchParams(location.search).get('region');
    if (qr && qr !== 'global' && DEPTH.hasOwnProperty(qr)) setRegion(qr);
  }).catch(function (err) {
    console.error('[TEKUMA map]', err);
    var p = document.createElement('p'); p.className = 'map-empty'; p.textContent = 'Map failed to load — please serve the site over http (see README).';
    section.appendChild(p);
  });

  document.addEventListener('tekuma:lang', function () {
    if (!projects.length) return;
    renderControls();
    renderLabels();
    hideCard();
  });

  // expose for debugging / screenshots
  window.TEKUMA_MAP = { setRegion: setRegion, state: state };
})();
