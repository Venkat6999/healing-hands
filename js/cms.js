/* ============================================================
   Healing Hands — universal content layer (CMS)
   ------------------------------------------------------------
   Every text, image, background image and button link on the
   public pages is tagged with one of:
       data-cms      -> text content
       data-cms-img  -> image source
       data-cms-alt  -> image description
       data-cms-bg   -> CSS background image
       data-cms-href -> button link
   This file loads the saved values from the server (or from
   data/content.json when the server is not running) and applies
   them to the page. The admin panel edits the same values.
   ============================================================ */
(function (window, document) {
  'use strict';

  var API = window.location.origin + '/api';
  var POLL_INTERVAL = 2000;
  var store = {};
  var lastVersion = -1;

  /* The backend is one Function mounted at /api, so the logical route travels
     in the X-HH-Route header rather than the URL. Without this every request
     404s, no saved content is applied to the page, and edits made in the admin
     panel appear to have no effect. */
  function routeFetch(route, opts) {
    var options = opts || {};
    var headers = { 'X-HH-Route': route };
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) { headers[k] = options.headers[k]; });
    }
    return fetch(API, {
      method: options.method || 'GET',
      cache: options.cache || 'no-store',
      headers: headers
    });
  }

  function apply(root) {
    var doc = root || document;

    doc.querySelectorAll('[data-cms]').forEach(function (el) {
      var key = el.getAttribute('data-cms');
      if (Object.prototype.hasOwnProperty.call(store, key)) el.textContent = store[key];
    });

    doc.querySelectorAll('[data-cms-img]').forEach(function (el) {
      var key = el.getAttribute('data-cms-img');
      var value = store[key];
      if (value) {
        el.setAttribute('src', value);
        // a responsive srcset keeps showing the old photo in the browser
        // even after src changes, so drop it when the CMS drives the image
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
      }
    });

    doc.querySelectorAll('[data-cms-alt]').forEach(function (el) {
      var key = el.getAttribute('data-cms-alt');
      if (Object.prototype.hasOwnProperty.call(store, key)) el.setAttribute('alt', store[key]);
    });

    doc.querySelectorAll('[data-cms-bg]').forEach(function (el) {
      var key = el.getAttribute('data-cms-bg');
      var value = store[key];
      if (value) el.style.backgroundImage = 'url("' + value.replace(/"/g, '%22') + '")';
    });

    doc.querySelectorAll('[data-cms-href]').forEach(function (el) {
      var key = el.getAttribute('data-cms-href');
      if (store[key]) el.setAttribute('href', store[key]);
    });

    window.dispatchEvent(new CustomEvent('hh-cms-applied'));
  }

  function load() {
    return routeFetch('/content')
      .then(function (res) { if (!res.ok) throw new Error('no api'); return res.json(); })
      .catch(function () {
        return fetch('/data/content.json', { cache: 'no-store' })
          .then(function (res) { return res.json(); })
          .catch(function () { return {}; });
      })
      .then(function (data) {
        store = data && typeof data === 'object' ? data : {};
        apply();
        return store;
      });
  }

  function poll() {
    routeFetch('/version')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.version !== lastVersion) {
          lastVersion = data.version;
          load();
        }
      })
      .catch(function () {});
  }

  var HHContent = {
    get: function (key) { return store[key]; },
    all: function () { return store; },
    set: function (data) { store = data || {}; apply(); },
    reapply: apply,
    reload: load
  };
  window.HHContent = HHContent;

  function boot() {
    load().then(function () {
      setInterval(poll, POLL_INTERVAL);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    });
    // re-apply after the structured data layer re-renders dynamic lists
    window.addEventListener('hh-content-updated', function () { apply(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
