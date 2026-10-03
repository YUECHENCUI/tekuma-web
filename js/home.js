/* TEKUMA · home page: renders the four service columns (P3) from js/i18n.js */
(function () {
  'use strict';
  var T = window.TEKUMA;

  function renderServices() {
    var root = document.getElementById('services');
    if (!root) return;
    root.innerHTML = T.SITE.services.map(function (s, i) {
      var items = T.t('service.' + s.key + '.items');
      return '' +
        '<article class="service">' +
          '<p class="service-index">' + T.esc(T.t('service.label')) + ' 0' + (i + 1) + '</p>' +
          '<h2 class="service-title">' + T.esc(T.t('service.brand')) + '<span class="sep">|</span>' + T.esc(T.t('service.' + s.key)) + '</h2>' +
          '<p class="service-text">' + T.esc(T.t('service.' + s.key + '.text')) + '</p>' +
          '<ul class="service-items">' + items.map(function (it) {
            return '<li><span class="plus" aria-hidden="true">+</span>' + T.esc(it) + '</li>';
          }).join('') + '</ul>' +
        '</article>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', renderServices);
  document.addEventListener('tekuma:lang', function () {
    renderServices();
    document.title = T.t('meta.title');
  });
  document.addEventListener('DOMContentLoaded', function () { document.title = T.t('meta.title'); });
})();
