/* Boot the real server and probe it over HTTP.

   This is the check that was missing. The old suite called the handler
   directly in-process, so it passed while the deployed site returned 404
   for every multi-segment route -- Vercel never routed the request. Probing
   a real HTTP server exercises routing, static mounting and access control
   exactly as a visitor would.

   Run: node scripts/check-routes-http.js   (or as part of `npm test`) */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3111; // deliberately not 3000, so a dev server can stay up
const BASE = `http://127.0.0.1:${PORT}`;

function req(method, url, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + url, {
      method,
      headers: Object.assign(
        {},
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      )
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on('error', () => resolve({ status: 0, body: '', headers: {} }));
    if (data) r.write(data);
    r.end();
  });
}

/* [url, expected status, description]
   200 public read · 401 auth required · 400 validation rejected
   All three prove the route matched. 404 means unrouted. */
const API = [
  ['/api/version', 200, 'version (public)'],
  ['/api/doctors', 200, 'doctors (public)'],
  ['/api/specialties', 200, 'specialties (public)'],
  ['/api/services', 200, 'services (public)'],
  ['/api/section-copy', 200, 'section-copy (public)'],
  ['/api/clinic-info', 200, 'clinic-info (public)'],
  ['/api/content', 200, 'content (public)'],
  ['/api/content-schema', 200, 'content-schema (public)'],
  ['/api/conditions', 200, 'conditions (public)'],
  ['/api/therapies', 200, 'therapies (public)'],
  ['/api/directory', 200, 'directory (public)'],
  ['/api/blogposts', 200, 'blogposts (public)'],
  ['/api/bookingoptions', 200, 'bookingoptions (public)'],
  ['/api/auth/check', 401, 'auth/check  (2 segments)'],
  ['/api/images', 401, 'images      (admin)'],
  ['/api/appointments', 401, 'appointments (admin)'],
  ['/api/backup', 401, 'backup      (admin)']
];

const API_POST = [
  ['/api/auth/login', 401, 'auth/login   (2 segments, bad passcode)'],
  ['/api/auth/change-passcode', 401, 'auth/change-passcode (2 segments)'],
  ['/api/appointments/add', 400, 'appointments/add (2 segments, empty body)'],
  ['/api/content/reset', 401, 'content/reset (2 segments)'],
  ['/api/backup/import', 401, 'backup/import (2 segments)'],
  ['/api/upload', 401, 'upload        (admin)'],
  ['/api/reset', 401, 'reset         (admin)']
];

const PAGES = ['/', '/index.html', '/about.html', '/services.html',
  '/what-we-treat.html', '/blog.html', '/faq.html', '/book-appointment.html', '/admin.html'];

/* must never be reachable over HTTP */
const FORBIDDEN = ['/server.js', '/lib/handler.js', '/scripts/seed.js', '/package.json',
  '/.env', '/data/passcode.json', '/data/doctors.json', '/pages/admin.html',
  '/supabase/schema.sql', '/legacy/server.js', '/node_modules/express/package.json'];

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 4000));

  let bad = 0;
  const line = (ok, label, extra) => {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  };

  try {
    console.log('\n=== API: public reads (200) ===');
    for (const [url, want, desc] of API.filter((a) => a[1] === 200)) {
      const r = await req('GET', url);
      line(r.status === want, `${url.padEnd(24)} ${desc}`, `got ${r.status}`);
    }

    console.log('\n=== API: protected + multi-segment ===');
    for (const [url, want, desc] of API.filter((a) => a[1] === 401)) {
      const r = await req('GET', url);
      line(r.status === want, `${url.padEnd(24)} ${desc}`, `got ${r.status}`);
    }
    for (const [url, want, desc] of API_POST) {
      const r = await req('POST', url, {});
      line(r.status === want, `${url.padEnd(24)} ${desc}`, `got ${r.status}`);
    }

    console.log('\n=== pages (flat URLs must resolve) ===');
    for (const url of PAGES) {
      const r = await req('GET', url);
      line(r.status === 200 && /<html/i.test(r.body), url, `got ${r.status}`);
    }

    console.log('\n=== assets ===');
    for (const url of ['/css/style.css', '/css/admin.css', '/js/site-data.js',
      '/js/admin.js', '/js/main.js', '/images/logo.png', '/data/content.json']) {
      const r = await req('GET', url);
      line(r.status === 200, url, `got ${r.status}`);
    }

    console.log('\n=== security headers present ===');
    const h = (await req('GET', '/')).headers;
    line(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options');
    line(!!h['x-frame-options'], 'X-Frame-Options');
    line(!!h['referrer-policy'], 'Referrer-Policy');

    console.log('\n=== source files must NOT be served ===');
    for (const url of FORBIDDEN) {
      const r = await req('GET', url);
      line(r.status === 404, url, `got ${r.status}`);
    }

    console.log('\n=== path traversal ===');
    for (const url of ['/uploads/..%2F..%2Fpackage.json', '/../package.json', '/images/../../package.json']) {
      const r = await req('GET', url);
      line(r.status === 404 || r.status === 301 || r.status === 302, url, `got ${r.status}`);
    }

    console.log('\n  ' + (bad ? bad + ' check(s) failed' : 'all routing checks passed') + '\n');
  } finally {
    srv.kill();
  }
  process.exit(bad ? 1 : 0);
})();