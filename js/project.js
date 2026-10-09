/* TEKUMA · project detail page  —  project.html?id=<project id from data/projects.json> */
(function () {
  'use strict';
  var T = window.TEKUMA;
  var root = document.getElementById('project-body');
  var head = document.getElementById('project-head');
  var id = new URLSearchParams(location.search).get('id');
  var all = [];

  function coords(p) {
    var lat = Math.abs(p.lat).toFixed(2) + '°' + (p.lat >= 0 ? 'N' : 'S');
    var lng = Math.abs(p.lng).toFixed(2) + '°' + (p.lng >= 0 ? 'E' : 'W');
    return lat + '  ' + lng;
  }

  function cover(p) {
    if (p.cover) return '<div class="pj-cover"><img src="' + T.esc(p.cover) + '" alt="' + T.esc(T.field(p, 'name')) + '"></div>';
    return '<div class="pj-cover" aria-hidden="true"><div class="ph-grid"></div><div class="ph-cross"></div>' +
      '<div class="ph"><span>' + T.esc(T.t('project.cover')) + '</span><span>' + coords(p) + '</span></div></div>';
  }

  /* Stacked full-bleed layers: click reveals the next image on top with a crossfade. */
  function layers(p) {
    var srcs = p.layers || [];
    if (srcs.length < 2) return '';
    var imgs = srcs.map(function (src, i) {
      return '<img class="pj-layer" data-i="' + i + '" src="' + T.esc(src) + '" alt=""' +
        (i === 0 ? '' : ' loading="lazy"') + ' draggable="false">';
    }).join('');
    return '' +
      '<div class="pj-layers" role="button" tabindex="0" aria-label="' + T.esc(T.t('project.layers.hint')) + '" data-step="0" data-n="' + srcs.length + '">' +
        '<div class="pj-layers-stack">' + imgs + '</div>' +
        '<div class="pj-layers-ui" aria-hidden="true">' +
          '<span class="pj-layers-hint">' + T.esc(T.t('project.layers.hint')) + '</span>' +
          '<span class="pj-layers-count"><b>1</b> / ' + srcs.length + '</span>' +
        '</div>' +
      '</div>';
  }

  function bindLayers(el) {
    if (!el) return;
    var n = parseInt(el.getAttribute('data-n'), 10) || 0;
    var step = 0;
    var imgs = el.querySelectorAll('.pj-layer');
    var hint = el.querySelector('.pj-layers-hint');
    var countB = el.querySelector('.pj-layers-count b');
    var busy = false;

    function paint() {
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].classList.toggle('is-on', i <= step);
      }
      if (countB) countB.textContent = String(step + 1);
      if (hint) hint.textContent = step >= n - 1 ? T.t('project.layers.done') : T.t('project.layers.hint');
      el.setAttribute('data-step', String(step));
      el.setAttribute('aria-label', hint ? hint.textContent : '');
    }

    function advance() {
      if (busy) return;
      busy = true;
      if (step >= n - 1) step = 0;
      else step += 1;
      paint();
      window.setTimeout(function () { busy = false; }, 520);
    }

    el.addEventListener('click', function (e) {
      e.preventDefault();
      advance();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        advance();
      }
    });
    paint();
  }

  function render() {
    var i = -1;
    for (var k = 0; k < all.length; k++) if (all[k].id === id) i = k;
    if (i < 0) {
      document.title = T.t('project.notfound') + ' · TEKUMA';
      head.innerHTML = '<h1 class="pj-title">' + T.esc(T.t('project.notfound')) + '</h1>';
      root.innerHTML = '<div class="pj-head"><div></div><p class="pj-summary">' + T.esc(T.t('project.notfound.text')) + '</p></div>';
      return;
    }
    var p = all[i];
    var prev = all[(i - 1 + all.length) % all.length], next = all[(i + 1) % all.length];
    var regions = (p.regions || []).map(function (r) { return T.t('map.region.' + r); });
    if (!regions.length) regions = [T.t('map.region.global')];
    var body = (p['body_' + T.lang()] || p.body_zh || []).filter(function (s) { return s && String(s).trim(); });
    var summary = T.field(p, 'summary');
    var gallery = p.gallery || [];
    var hasLayers = (p.layers || []).length >= 2;

    document.title = T.field(p, 'name') + ' · TEKUMA';
    head.innerHTML =
      '<p class="pj-kicker"><span>' + T.esc(T.t('service.brand')) + (p.service ? ' · ' + T.esc(T.t('service.' + p.service)) : '') + '</span><span class="yr">' + p.year + '</span></p>' +
      '<h1 class="pj-title">' + T.esc(T.field(p, 'name')) + '</h1>' +
      (p.example ? '<span class="pj-sample">' + T.esc(T.t('project.sample')) + '</span>' : '');
    root.innerHTML =
      (hasLayers ? layers(p) : cover(p)) +
      '<div class="pj-head' + (summary || body.length ? '' : ' is-meta-only') + '">' +
        '<dl class="pj-meta">' +
          (p.service ? row(T.t('project.service'), T.t('service.' + p.service)) : '') +
          row(T.t('project.location'), T.field(p, 'city') + (p.country_zh ? ' · ' + T.field(p, 'country') : '')) +
          row(T.t('project.year'), p.year) +
          row(T.t('project.region'), regions.join(' / ')) +
          row(T.t('project.coords'), coords(p)) +
        '</dl>' +
        (summary || body.length ? '<div>' +
          (summary ? '<p class="pj-summary">' + T.esc(summary) + '</p>' : '') +
          (body.length ? '<div class="pj-body">' + body.map(function (para) { return '<p>' + T.esc(para) + '</p>'; }).join('') + '</div>' : '') +
        '</div>' : '') +
      '</div>' +
      (!hasLayers && gallery.length ? '<div class="pj-gallery">' + gallery.map(function (src) { return '<img src="' + T.esc(src) + '" alt="" loading="lazy">'; }).join('') + '</div>' : '') +
      '<nav class="pj-nav">' +
        '<a href="project.html?id=' + encodeURIComponent(prev.id) + '"><small>← ' + T.esc(T.t('project.prev')) + '</small><span>' + T.esc(T.field(prev, 'name')) + '</span></a>' +
        '<a href="project.html?id=' + encodeURIComponent(next.id) + '"><small>' + T.esc(T.t('project.next')) + ' →</small><span>' + T.esc(T.field(next, 'name')) + '</span></a>' +
      '</nav>';
    bindLayers(root.querySelector('.pj-layers'));
  }

  function row(k, v) { return '<div><dt>' + T.esc(k) + '</dt><dd>' + T.esc(v) + '</dd></div>'; }

  T.loadProjects().then(function (list) { all = list; render(); }).catch(function (e) {
    console.error('[TEKUMA project]', e);
    root.innerHTML = '<p class="pj-summary">Could not load data/projects.json — please serve the site over http (see README).</p>';
  });
  document.addEventListener('tekuma:lang', function () { if (all.length) render(); });
})();
