/* ============================================================
   Build-time image manifest
   ------------------------------------------------------------
   The old /api/images endpoint walked ./images on disk at request
   time. A serverless function cannot do that, so the static images
   are enumerated here at build time into api/lib/image-manifest.json.

   Run automatically by `npm run build` (and by postinstall) so it is
   always in sync before a Vercel build.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const OUT = path.join(__dirname, '..', 'api', 'lib', 'image-manifest.json');

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

function walk(dir, prefix, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (err) { return out; }

  entries.forEach((entry) => {
    if (entry.name.startsWith('.')) return;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel + '/', out);
    if (IMAGE_RE.test(entry.name)) out.push(rel);
  });
  return out;
}

const files = walk(IMAGES_DIR, 'images/', []).sort();

fs.writeFileSync(OUT, JSON.stringify(files, null, 2) + '\n', 'utf8');
console.log(`image manifest: ${files.length} images -> ${path.relative(ROOT, OUT)}`);