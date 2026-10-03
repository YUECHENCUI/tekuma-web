/* ==========================================================================
   TEKUMA · shared helpers: site config, language switching, grain effect
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Site-wide settings (edit here) ----------------------------------- */
  var SITE = {
    defaultLang: 'zh',
    // Service categories: order = order of the columns on the home page (P3).
    // The map does not distinguish services; a project's service is shown as text in its card / page.
    services: [
      { key: 'strategy' },
      { key: 'design' },
      { key: 'innovation' },
      { key: 'incubation' }
    ],
    // Map regions (filter + camera). `abbr` is shown as a small code.
    regions: [
      { key: 'global' },
      { key: 'china' },
      { key: 'jjj', abbr: 'JJJ' },
      { key: 'yrd', abbr: 'YRD' },
      { key: 'gba', abbr: 'GBA' }
    ],
    years: ['all', 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]
  };

  /* ---- Language --------------------------------------------------------- */
  var STORE_KEY = 'tekuma.lang';
  var DICT = window.TEKUMA_I18N;

  function initialLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && DICT[q]) { try { localStorage.setItem(STORE_KEY, q); } catch (e) {} return q; }
    try { var s = localStorage.getItem(STORE_KEY); if (s && DICT[s]) return s; } catch (e) {}
    return SITE.defaultLang;
  }

  var lang = initialLang();

  function t(key, vars) {
    var v = DICT[lang][key];
    if (v === undefined) v = DICT.zh[key];
    if (v === undefined) return key;
    if (typeof v === 'string' && vars) {
      v = v.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; });
    }
    return v;
  }

  /** Pick the right-language field from a data object: field(p, 'name') -> p.name_zh / p.name_en */
  function field(obj, name) {
    return obj[name + '_' + lang] || obj[name + '_zh'] || obj[name + '_en'] || '';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Render a string or array (multi-line) into an element. */
  function fill(el, value) {
    if (Array.isArray(value)) {
      el.innerHTML = value.map(function (line) { return '<span class="line">' + esc(line) + '</span>'; }).join('');
    } else {
      el.textContent = value;
    }
  }

  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      fill(el, t(el.getAttribute('data-i18n'), { year: new Date().getFullYear() }));
    });
    root.querySelectorAll('[data-set-lang]').forEach(function (el) {
      var on = el.getAttribute('data-set-lang') === lang;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setLang(next) {
    if (!DICT[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) {}
    var url = new URL(location.href);
    if (url.searchParams.has('lang')) { url.searchParams.set('lang', next); history.replaceState(null, '', url); }
    apply();
    document.dispatchEvent(new CustomEvent('tekuma:lang', { detail: { lang: lang } }));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set-lang]');
    if (b) { e.preventDefault(); setLang(b.getAttribute('data-set-lang')); }
  });

  /* ---- Grain: red → white "spray" dissolve, painted on <canvas class="grain"> ----
     data-fade="down": transparent at top, white at bottom (end of the red hero)
     data-fade="up":   white at top, transparent at bottom (start of the red section) */
  function paintGrain(canvas) {
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    canvas.width = w; canvas.height = h;   // 1 grain = 1 CSS px
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h), d = img.data;
    var down = canvas.getAttribute('data-fade') !== 'up';
    for (var y = 0; y < h; y++) {
      var u = y / (h - 1);                 // 0 → 1 from top to bottom
      if (!down) u = 1 - u;                // u: 0 = red side, 1 = white side
      var s = u * u * (3 - 2 * u);         // smoothstep
      var g = Math.pow(s, 1.35);           // base white amount
      var amp = 1.15 * Math.pow(Math.sin(Math.PI * g), 0.8); // noise strongest mid-fade, zero at both ends
      for (var x = 0; x < w; x++) {
        var a = g + (Math.random() - 0.5) * amp;
        if (a <= 0) continue;
        var i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = a >= 1 ? 255 : a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* Repaint when a grain canvas really changes size (rotation, window resize).
     Painted at 1 canvas px per CSS px and scaled with image-rendering: pixelated, so it stays
     crisp on retina screens while the pixel loop stays small on phones. */
  var painted = new WeakMap();
  function maybePaint(canvas) {
    var r = canvas.getBoundingClientRect(), last = painted.get(canvas);
    if (last && Math.abs(last.w - r.width) < 2 && Math.abs(last.h - r.height) < 24) return;
    painted.set(canvas, { w: r.width, h: r.height });
    paintGrain(canvas);
  }
  function initGrain() {
    var list = document.querySelectorAll('canvas.grain');
    list.forEach(maybePaint);
    if (window.ResizeObserver) {
      var t;
      var ro = new ResizeObserver(function (entries) {
        clearTimeout(t);
        t = setTimeout(function () { list.forEach(maybePaint); }, 150);
      });
      list.forEach(function (c) { ro.observe(c); });
    } else {
      window.addEventListener('resize', function () { list.forEach(maybePaint); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    initGrain();
  });

  window.TEKUMA = {
    SITE: SITE,
    t: t,
    field: field,
    esc: esc,
    fill: fill,
    apply: apply,
    lang: function () { return lang; },
    setLang: setLang,
    loadProjects: function () {
      return fetch('data/projects.json', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('projects.json ' + r.status);
        return r.json();
      }).then(function (d) { return d.projects || d; });
    },
    service: function (key) {
      for (var i = 0; i < SITE.services.length; i++) if (SITE.services[i].key === key) return SITE.services[i];
      return SITE.services[0];
    }
  };
})();
