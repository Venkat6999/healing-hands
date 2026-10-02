/* Drive the REAL js/site-data.js against the real backend over HTTP.

   The API contract changed: one Function at /api, with the logical route in an
   X-HH-Route header. This loads the actual site-data.js in a minimal
   window/document shim and calls its real public methods, so a mistake in the
   four fetch helpers cannot hide behind a passing unit test.

   Run: node scripts/check-client-api.js */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PORT = 3112;
const BASE = `http://127.0.0.1:${PORT}`;

function loadSiteData() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'site-data.js'), 'utf8');
  const store = {};
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const win = {
    location: { origin: BASE, protocol: 'http:', href: BASE + '/' },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: (url, opts) => fetch(url.startsWith('http') ? url : BASE + url, opts),
    console,
    document: {
      addEventListener() {}, removeEventListener() {}, readyState: 'complete',
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: el,
      body: el(), documentElement: { classList: { add() {}, remove() {} } }
    }
  };
  win.window = win;
  win.self = win;
  win.fetch = win.fetch;
  // site-data.js dispatches CustomEvent after a save; node has no DOM
  win.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; Object.assign(this, init); }
  };
  win.dispatchEvent = () => true;
  win.addEventListener = win.addEventListener || (() => {});
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'site-data.js' });
  return { HH: win.HH, store };
}

let bad = 0;
const line = (ok, label, extra) => {
  if (!ok) bad++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'scripts', 'local-server.js')], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 4000));

  try {
    const { HH, store } = loadSiteData();
    line(!!HH, 'site-data.js loaded and exported HH');

    /* sign in the way the admin panel does, then stash the token where
       site-data.js looks for it */
    const loginRes = await fetch(BASE + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HH-Route': '/auth/login' },
      body: JSON.stringify({ passcode: (process.env.HH_TEST_PASSCODE || process.env.ADMIN_PASSCODE || '') })
    });
    const loginJson = await loginRes.json();
    line(loginRes.status === 200 && !!loginJson.token, 'sign in via /api with X-HH-Route', 'status ' + loginRes.status);
    if (!loginJson.token) throw new Error('cannot continue without a token');
    store.hh_admin_session = loginJson.token;

    console.log('\n=== reads through the real client helpers ===');
    const reads = [
      ['getDoctors', (v) => Array.isArray(v) && v.length > 0],
      ['getSpecialties', (v) => Array.isArray(v) && v.length > 0],
      ['getServices', (v) => Array.isArray(v) && v.length > 0],
      ['getConditions', (v) => Array.isArray(v) && v.length > 0],
      ['getBlogPosts', (v) => Array.isArray(v) && v.length > 0],
      ['getTherapies', (v) => v && typeof v === 'object'],
      ['getDirectory', (v) => v && typeof v === 'object'],
      ['getBookingOptions', (v) => v && typeof v === 'object'],
      ['getSectionCopy', (v) => v && v.specialties],
      ['getClinicInfo', (v) => v && v.phone],
      ['getAppointments', (v) => Array.isArray(v)]
    ];
    for (const [fn, ok] of reads) {
      try {
        const v = await HH[fn]();
        line(ok(v), fn.padEnd(20), Array.isArray(v) ? v.length + ' items' : '');
      } catch (e) { line(false, fn, e.message); }
    }

    console.log('\n=== content (cms.js path) via the same header contract ===');
    const contentRes = await fetch(BASE + '/api', { headers: { 'X-HH-Route': '/content' } });
    const content = await contentRes.json();
    line(contentRes.status === 200 && Object.keys(content).length > 400,
      'GET /content', Object.keys(content).length + ' keys');

    console.log('\n=== write round trip (count must be unchanged) ===');
    try {
      const before = (await HH.getDoctors()).length;
      await HH.saveDoctors(await HH.getDoctors());
      const after = (await HH.getDoctors()).length;
      line(before === after && before > 0, 'saveDoctors round trip', before + ' -> ' + after);
    } catch (e) { line(false, 'saveDoctors round trip', e.message); }

    console.log('\n=== booking form path, which is public (no token) ===');
    try {
      const added = await HH.addAppointment({
        name: 'Client Check', mobile: '9000000000', treatment: 'Manual therapy',
        date: '2027-01-15', address: '1 Test Road', email: 'check@example.com', age: 30
      });
      const id = added && (added.id || (added.record && added.record.id));
      line(!!id, 'addAppointment created a record');
      if (id) {
        await HH.updateAppointment(id, { status: 'Confirmed' });
        const list = await HH.getAppointments();
        const found = list.find(a => a.id === id);
        line(!!found && found.status === 'Confirmed', 'updateAppointment persisted');
        line(!!found && typeof found.createdAt === 'string', 'createdAt kept its camelCase name');
        await HH.deleteAppointment(id);
        const after = await HH.getAppointments();
        line(!after.some(a => a.id === id), 'deleteAppointment removed it');
      }
    } catch (e) { line(false, 'appointment round trip', e.message); }

    console.log('\n=== backup export/import shape ===');
    try {
      const all = await HH.exportAll();
      const keys = all && typeof all === 'object' ? Object.keys(all) : [];
      line(keys.includes('doctors') && keys.includes('content') && keys.includes('conditions'),
        'exportAll', keys.length + ' keys');
    } catch (e) { line(false, 'exportAll', e.message); }

    console.log('\n=== an unauthenticated request must be rejected by the server ===');
    // tested directly rather than through getAppointments, which would answer
    // from its in-memory cache and hide whether the server actually rejected it
    delete store.hh_admin_session;
    const anon = await fetch(BASE + '/api', { headers: { 'X-HH-Route': '/appointments' } });
    line(anon.status === 401, 'GET /appointments with no token -> 401', 'got ' + anon.status);
    const anonSave = await fetch(BASE + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HH-Route': '/doctors' },
      body: JSON.stringify([])
    });
    line(anonSave.status === 401, 'POST /doctors with no token -> 401', 'got ' + anonSave.status);
    const noRoute = await fetch(BASE + '/api');
    line(noRoute.status === 400, 'request with no X-HH-Route -> 400', 'got ' + noRoute.status);

    console.log('\n  ' + (bad ? bad + ' check(s) failed' : 'client API contract verified') + '\n');
  } catch (e) {
    console.error('\n  crashed: ' + e.message + '\n');
    bad++;
  } finally {
    srv.kill();
  }
  process.exit(bad ? 1 : 0);
})();