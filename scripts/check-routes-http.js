/* Boot the local server (which mirrors the Vercel deployment) and probe it
   over real HTTP.

   The API is a single Function at /api, so every call must carry its logical
   route in the X-HH-Route header. A request without that header, or with a
   route the backend does not implement, must come back 400/404 rather than
   silently succeeding.

   Run: node scripts/check-routes-http.js   (or as part of `npm test`) */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;

function req(method, url, { route, body, token } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    let payload = null;
    if (route) headers['X-HH-Route'] = route;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const r = http.request(BASE + url, { method, headers }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(out); } catch (e) { /* not json */ }
        resolve({ status: res.statusCode, body: json, raw: out, headers: res.headers });
      });
    });
    r.on('error', () => resolve({ status: 0, body: null, raw: '', headers: {} }));
    if (payload) r.write(payload);
    r.end();
  });
}

/* [route, expected status] -- 200 public, 401 auth, 400 rejected */
const API = [
  ['/version', 200], ['/doctors', 200], ['/specialties', 200], ['/services', 200],
  ['/section-copy', 200], ['/clinic-info', 200], ['/content', 200], ['/content-schema', 200],
  ['/conditions', 200], ['/therapies', 200], ['/directory', 200], ['/blogposts', 200],
  ['/bookingoptions', 200],
  ['/auth/check', 401], ['/images', 401], ['/appointments', 401], ['/backup', 401]
];

const API_POST = [
  ['/auth/login', 401], ['/auth/change-passcode', 401], ['/content/reset', 401],
  ['/backup/import', 401], ['/upload', 401], ['/reset', 401],
  ['/appointments/add', 400], ['/doctors', 401]
];

const PAGES = ['/', '/index.html', '/about.html', '/services.html', '/what-we-treat.html',
  '/blog.html', '/faq.html', '/book-appointment.html', '/admin.html'];

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'scripts', 'local-server.js')], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 4000));

  let bad = 0;
  const line = (ok, label, extra) => {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  };

  try {
    console.log('\n=== public reads, route in X-HH-Route ===');
    for (const [route, want] of API.filter((a) => a[1] === 200)) {
      const r = await req('GET', '/api', { route });
      line(r.status === want, route.padEnd(22), `got ${r.status}`);
    }

    console.log('\n=== protected routes ===');
    for (const [route, want] of API.filter((a) => a[1] === 401)) {
      const r = await req('GET', '/api', { route });
      line(r.status === want, route.padEnd(22), `got ${r.status}`);
    }

    console.log('\n=== writes (route in header, payload in body) ===');
    for (const [route, want] of API_POST) {
      const r = await req('POST', '/api', { route, body: {} });
      line(r.status === want, route.padEnd(22), `got ${r.status}`);
    }

    console.log('\n=== unknown route must be rejected ===');
    const bad1 = await req('GET', '/api', { route: '/does-not-exist' });
    line(bad1.status === 404, 'unknown route -> 404', `got ${bad1.status}`);
    const bad2 = await req('GET', '/api', { route: '/../../package.json' });
    line(bad2.status === 400, 'traversal route -> 400', `got ${bad2.status}`);

    console.log('\n=== sign-in and a full authenticated round trip ===');
    const login = await req('POST', '/api', { route: '/auth/login', body: { passcode: process.env.HH_TEST_PASSCODE || 'healinghands2026' } });
    line(login.status === 200 && !!login.body.token, 'POST /auth/login -> token', `got ${login.status}`);
    const token = login.body && login.body.token;
    if (token) {
      const chk = await req('GET', '/api', { route: '/auth/check', token });
      line(chk.status === 200 && chk.body.ok === true, 'GET /auth/check with token', `got ${chk.status}`);
      const imgs = await req('GET', '/api', { route: '/images', token });
      line(imgs.status === 200 && Array.isArray(imgs.body), 'GET /images with token', `got ${imgs.status}`);
      const appts = await req('GET', '/api', { route: '/appointments', token });
      line(appts.status === 200 && Array.isArray(appts.body), 'GET /appointments with token', `got ${appts.status}`);
      const bk = await req('GET', '/api', { route: '/backup', token });
      line(bk.status === 200 && 'content' in bk.body, 'GET /backup with token', `got ${bk.status}`);
    }

    console.log('\n=== pages ===');
    for (const url of PAGES) {
      const r = await req('GET', url);
      line(r.status === 200 && /<html/i.test(r.raw), url, `got ${r.status}`);
    }

    console.log('\n=== assets ===');
    for (const url of ['/css/style.css', '/css/admin.css', '/js/site-data.js', '/js/admin.js',
      '/js/main.js', '/images/logo.png', '/data/content.json']) {
      const r = await req('GET', url);
      line(r.status === 200, url, `got ${r.status}`);
    }

    console.log('\n=== api/ internals must NOT be served as static files ===');
    for (const url of ['/api/index.js', '/lib/handler.js', '/package.json', '/data/passcode.json']) {
      const r = await req('GET', url);
      const leaked = r.status === 200 && /require\(|module\.exports/.test(r.raw);
      line(!leaked, url, `got ${r.status}`);
    }

    console.log('\n=== security headers ===');
    const h = (await req('GET', '/')).headers;
    line(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options');
    line(!!h['x-frame-options'], 'X-Frame-Options');
    line(!!h['referrer-policy'], 'Referrer-Policy');

    console.log('\n  ' + (bad ? bad + ' check(s) failed' : 'all routing checks passed') + '\n');
  } finally {
    srv.kill();
  }
  process.exit(bad ? 1 : 0);
})();