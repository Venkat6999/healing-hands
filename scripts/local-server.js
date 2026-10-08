/* ============================================================
   Local server — mirrors the Vercel deployment, for testing only
   ------------------------------------------------------------
   Vercel serves this project as:
     * static files from the project root (outputDirectory ".")
     * rewrites for the flat page URLs
     * ONE Function at /api, which is api/index.js
     * files under api/ are NOT served as static content

   This reproduces all four so every route can be tested before deploying.
   Not deployed: scripts/ is in .vercelignore.
   ============================================================ */
const express = require('express');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

/* ---------- .env, so local runs need no exported variables ---------- */
(function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  });
})();

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* the single Function, exactly as Vercel mounts it at /api */
app.use('/api', require(path.join(ROOT, 'api', 'index.js')));

/* flat page URLs */
const PAGES = ['index', 'about', 'services', 'what-we-treat', 'blog', 'faq',
  'book-appointment', 'admin'];
PAGES.forEach((name) => {
  app.get('/' + name + '.html', (req, res) => {
    res.sendFile(path.join(ROOT, 'pages', name + '.html'));
  });
});
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'pages', 'index.html')));

/* Mirror .vercelignore, so local runs match what is actually deployed.
   These paths exist on a developer machine but are not uploaded to Vercel. */
app.use('/lib', (req, res) => res.status(404).send('Not found'));
[
  'appointments', 'passcode', 'doctors', 'specialties', 'services', 'sectionCopy',
  'clinicInfo', 'conditions', 'therapies', 'directory', 'blogposts', 'booking-options',
  'gallery'
].forEach((name) => {
  app.get('/data/' + name + '.json', (req, res) => res.status(404).send('Not found'));
});

/* static files from the root, except api/ which is the Function */
app.use(express.static(ROOT, {
  index: false,
  setHeaders(res, filePath) {
    if (/[\\/]images[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.use('/api', (req, res) => res.status(404).send('Not found'));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`\n  Healing Hands (local) at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin.html\n`);
});

module.exports = app;