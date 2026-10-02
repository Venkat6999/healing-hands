/* Load the REAL js/cms.js against the real backend and prove it applies saved
   content to the page, and that its 2-second version poll notices a change.

   This is the check that would have caught the cms.js bug: cms.js was still
   requesting the old API + "/content" URL, so every public page silently
   failed to apply saved content. It looked like "my admin edits do nothing" and
   "the preview is broken", while the backend was working perfectly.

   Run: node scripts/check-cms-layer.js */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PORT = 3113;
const BASE = `http://127.0.0.1:${PORT}`;

/* a document with the tags cms.js is responsible for */
function makeDocument() {
  const mk = (attrs) => {
    const el = { attrs: {}, textContent: '', style: {}, _set: {},
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = v; } };
    return el;
  };
  const text = mk({ 'data-cms': 'index.t1' });
  const img = mk({ 'data-cms-img': 'index.img3' });
  const bg = mk({ 'data-cms-bg': 'index.bg1' });
  const href = mk({ 'data-cms-href': 'index.href14' });

  const byKey = {};
  [text, img, bg, href].forEach((el) => {
    const k = el.getAttribute('data-cms') || el.getAttribute('data-cms-img') ||
      el.getAttribute('data-cms-bg') || el.getAttribute('data-cms-href');
    byKey[k] = el;
  });
  return { elements: [text, img, bg, href], byKey };
}

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'scripts', 'local-server.js')], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 4000));

  let bad = 0;
  const safe = (v) => { try { return JSON.stringify(v) === undefined ? '(undefined)' : String(v).slice(0, 44); } catch (e) { return '(threw)'; } };
  const line = (ok, label, extra) => {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  };
  const check = (label, fn) => {
    let ok = false, extra = '';
    try {
      const r = fn();
      // the callback returns true for a bare pass, or a truthy value that is
      // also worth printing; only false/undefined means the check failed
      ok = r !== false && r !== undefined && r !== null && r !== '';
      if (r !== true) extra = safe(r);
    } catch (e) { ok = false; extra = 'threw: ' + e.message; }
    line(ok, label, extra);
  };
  try {
    const doc = makeDocument();
    const listeners = {};
    const win = {
      location: { origin: BASE, protocol: 'http:', href: BASE + '/' },
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
      removeEventListener() {},
      dispatchEvent: () => true,
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
      CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
      fetch: (u, o) => fetch(u.startsWith('http') ? u : BASE + u, o),
      console,
      document: {
        readyState: 'complete',
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener() {},
        querySelectorAll: (sel) => {
          if (sel === '[data-cms]') return doc.elements.filter(e => e.getAttribute('data-cms'));
          if (sel === '[data-cms-img]') return doc.elements.filter(e => e.getAttribute('data-cms-img'));
          if (sel === '[data-cms-bg]') return doc.elements.filter(e => e.getAttribute('data-cms-bg'));
          if (sel === '[data-cms-href]') return doc.elements.filter(e => e.getAttribute('data-cms-href'));
          if (sel === '[data-cms-alt]') return [];
          return [];
        }
      }
    };
    win.window = win;
    const ctx = vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'cms.js'), 'utf8'), ctx, { filename: 'cms.js' });

    console.log('\n=== cms.js applies saved content to the page ===\n');

    /* wait for its initial load() to settle */
    let waited = 0;
    while (waited < 15000 && win.HHContent && Object.keys(win.HHContent.all()).length === 0) {
      await new Promise((r) => setTimeout(r, 250));
      waited += 250;
    }

    check('cms.js exposed window.HHContent', () => !!win.HHContent);
    const store = win.HHContent ? win.HHContent.all() : {};
    check('content loaded from the API', () => Object.keys(store).length > 400 ? Object.keys(store).length + ' keys' : Object.keys(store).length + ' keys');
    check('load did not time out', () => waited < 15000 ? waited + 'ms' : 'timed out after ' + waited + 'ms');
    check('a known content key is present', () => !!store['index.t1'] || store['index.t1']);

    const textEl = doc.byKey['index.t1'];
    check('data-cms text applied', () => textEl && textEl.textContent === store['index.t1'] ? textEl.textContent : { got: textEl && textEl.textContent, want: store['index.t1'] });
    const imgEl = doc.byKey['index.img3'];
    check('data-cms-img src applied', () => imgEl && imgEl.getAttribute('src') === store['index.img3'] ? imgEl.getAttribute('src') : { got: imgEl && imgEl.getAttribute('src'), want: store['index.img3'] });
    const bgEl = doc.byKey['index.bg1'];
    check('data-cms-bg background applied', () => bgEl && /url\(/.test(bgEl.style.backgroundImage || '') ? bgEl.style.backgroundImage : { got: bgEl && bgEl.style.backgroundImage, want: 'url(...)' });
    const hrefEl = doc.byKey['index.href14'];
    check('data-cms-href applied', () => hrefEl && hrefEl.getAttribute('href') === store['index.href14'] ? hrefEl.getAttribute('href') : { got: hrefEl && hrefEl.getAttribute('href'), want: store['index.href14'] });


    console.log('\n=== the version poll must not error ===');
    /* cms.js polls /version every 2s; a 404 there was the visible symptom */
    const pollRes = await fetch(BASE + '/api', { headers: { 'X-HH-Route': '/version' } });
    line(pollRes.status === 200, 'GET /version with the route header -> 200', 'got ' + pollRes.status);
    const contentRes = await fetch(BASE + '/api', { headers: { 'X-HH-Route': '/content' } });
    line(contentRes.status === 200, 'GET /content with the route header -> 200', 'got ' + contentRes.status);

    console.log('\n  ' + (bad ? bad + ' check(s) failed' : 'cms layer verified') + '\n');
  } catch (e) {
    console.error('\n  crashed: ' + e.message + '\n');
    bad++;
  } finally {
    srv.kill();
  }
  process.exit(bad ? 1 : 0);
})();