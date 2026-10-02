/* Prove every file in api/ maps to a URL the handler actually serves.

Vercel maps  api/auth/login.js  ->  /api/auth/login
        api/appointments/[id].js -> /api/appointments/<one segment>

This check exists because an earlier catch-all file, api/[...path].js, compiled as a
single segment: /api/version worked while /api/auth/check returned 404. Nothing
in the local test suite caught that, so this now runs as part of 
pm test.

   Vercel maps  api/auth/login.js  ->  /api/auth/login
   Vercel maps  api/foo/[id].js    ->  /api/foo/<one segment>
   Vercel maps  api/[...path].js   ->  /api/<many segments>   (catch-all)

   For each function file we derive the URL Vercel would serve it at, call the
   handler with that URL, and fail if the handler falls through to its 404
   fallback. A 401/400 is fine -- that means the route matched and the request
   was correctly rejected. */
const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\Users\\nvnre\\Downloads\\healing-hands-site\\healing-hands-site\\healing-hands-site';

// load .env so the handler can reach Supabase
fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
});

const handler = require(path.join(ROOT, 'lib', 'handler.js'));

/* every function file under api/ */
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.js')) files.push(rel);
  }
})('api');

/* file path -> the URL Vercel serves it at */
function urlFor(file) {
  // api/auth/login.js -> /api/auth/login
  // api/appointments/[id].js -> /api/appointments/sample-id
  // api/[...path].js -> /api/a/b/c
  return '/' + file
    .replace(/\.js$/, '')
    .replace(/^api\//, 'api/')
    .replace(/\[\.\.\.(\w+)\]/g, 'a/b/c')
    .replace(/\[(\w+)\]/g, 'sample-id');
}

function call(method, url, body) {
  return new Promise((resolve) => {
    const req = {
      method, url, headers: {}, body,
      socket: { remoteAddress: '203.0.113.9' },
      query: {}
    };
    let payload = '';
    const res = {
      statusCode: 200,
      _h: {},
      setHeader(k, v) { this._h[String(k).toLowerCase()] = v; },
      end(chunk) {
        if (chunk) payload += chunk;
        let json = null;
        try { json = JSON.parse(payload); } catch (e) { /* not json */ }
        resolve({ status: this.statusCode, body: json, raw: payload });
      }
    };
    try { handler(req, res).catch((e) => resolve({ status: 0, raw: 'CRASH ' + e.message })); }
    catch (e) { resolve({ status: 0, raw: 'CRASH ' + e.message }); }
    setTimeout(() => resolve({ status: 0, raw: 'timeout' }), 20000);
  });
}

const GET_ROUTES = new Set([
  '/api/version', '/api/doctors', '/api/specialties', '/api/services',
  '/api/section-copy', '/api/clinic-info', '/api/content', '/api/content-schema',
  '/api/images', '/api/appointments', '/api/conditions', '/api/therapies',
  '/api/directory', '/api/blogposts', '/api/bookingoptions', '/api/backup',
  '/api/auth/check'
]);

(async () => {
  console.log('\n=== does every api/ file resolve to a URL the handler serves? ===\n');

  let unmatched = 0;
  for (const file of files.sort()) {
    const url = urlFor(file);
    const isPutDelete = file.includes('[id]');
    const isPost = !GET_ROUTES.has(url) && !isPutDelete;

    // a POST with a deliberately invalid body must be rejected by validation,
    // not by routing -- so any 400/401 proves the route matched
    const method = isPutDelete ? 'PUT' : (isPost ? 'POST' : 'GET');
    const body = isPost ? {} : undefined;

    const r = await call(method, url, body);
    const fellThrough = r.status === 404 && /Not found/i.test(r.raw || '');
    const crashed = r.status === 0;

    if (fellThrough || crashed) {
      unmatched++;
      console.log(`  UNROUTED  ${file.padEnd(28)} -> ${method} ${url}`);
      console.log(`            status ${r.status} ${(r.raw || '').slice(0, 60)}`);
    } else {
      console.log(`  ok        ${file.padEnd(28)} -> ${method} ${url.padEnd(30)} ${r.status}`);
    }
  }

  console.log('');
  if (unmatched) {
    console.log(`  ${unmatched} file(s) do not reach the handler.\n`);
    process.exit(1);
  }
  console.log(`  All ${files.length} function files route correctly.\n`);
})();