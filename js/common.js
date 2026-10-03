/* ==========================================================================
   TEKUMA · shared helpers: site config, language switching
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

  document.addEventListener('DOMContentLoaded', function () {
    apply();
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
    }
  };
})();
