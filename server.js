/* ============================================================
   Healing Hands — server
   ------------------------------------------------------------
   Vercel detects this file in the project root and captures it as a
   single Serverless Function. That matters because the Hobby plan
   allows at most 12 functions per deployment, and Vercel's per-file
   routing inside /api had two problems:

     * a catch-all file, api/[...path].js, compiled as a single
       segment, so /api/auth/login never resolved
     * one file per endpoint meant 25 functions, over the limit

   Express routes by path natively, so there is one function, no glob
   patterns, and no catch-all syntax to get wrong. Because this file
   also runs locally with plain `node server.js`, every route can be
   tested over real HTTP before deploying.

   The API itself lives in lib/handler.js and is unchanged.
   ============================================================ */
const express = require('express');
const path = require('path');
const fs = require('fs');

/* ---------- local .env ----------
   On Vercel the environment variables are set by the platform and this
   file is not deployed, so this is a no-op there. It exists so that
   `npm start` works on a developer machine. */
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  });
})();

const handler = require('./lib/handler');
const { uploadPublicUrl } = require('./lib/supabase');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

app.disable('x-powered-by');

/* ---------- security headers (same policy as the old Express app) ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ---------- CORS ---------- */
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  next();
});

/* ---------- API ----------
   The handler dispatches on the full path, so restore the /api prefix
   that Express strips when mounting. */
app.use('/api', express.json({ limit: '10mb' }));
app.use('/api', express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', (req, res) => {
  req.url = '/api' + req.url;
  return handler(req, res);
});

/* ---------- uploaded images -> Supabase Storage ----------
   Uploads are stored with their absolute URL, so this only serves any
   older "/uploads/<name>" value already saved in content. */
app.get('/uploads/*', (req, res) => {
  const name = decodeURIComponent(req.params[0] || '').replace(/^\/+/, '');
  if (!name || name.includes('..')) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.redirect(302, uploadPublicUrl(name));
});

/* ---------- flat page URLs ----------
   The markup lives in pages/, but the public URLs stay flat so
   sitemap.xml and existing links keep working. */
const PAGES = ['index', 'about', 'services', 'what-we-treat', 'blog', 'faq',
  'book-appointment', 'admin'];
PAGES.forEach((name) => {
  app.get('/' + name + '.html', (req, res) => {
    res.sendFile(path.join(ROOT, 'pages', name + '.html'));
  });
});
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'pages', 'index.html'));
});

/* ---------- static assets ----------
   Only the directories the browser requests are mounted. A blanket
   express.static(ROOT) would also publish server.js, lib/, scripts/,
   package.json and data/passcode.json, so each path is listed
   explicitly instead. */
const staticOpts = { index: false, redirect: false };
app.use('/css', express.static(path.join(ROOT, 'css'), staticOpts));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOpts));
app.use('/images', express.static(path.join(ROOT, 'images'), {
  ...staticOpts,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// the offline fallback used by js/cms.js when the API cannot be reached
app.get('/data/content.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'data', 'content.json'));
});

/* ---------- fallback ---------- */
app.use((req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.status(404).send('Not found');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Healing Hands running at http://localhost:${PORT}`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin.html\n`);
  });
}

module.exports = app;