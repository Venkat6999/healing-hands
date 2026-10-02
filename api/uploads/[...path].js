/* ============================================================
   /uploads/<name>  ->  Supabase Storage
   ------------------------------------------------------------
   Content stores uploads as site-relative paths ("/uploads/x.jpg"),
   which was a local folder before. This function 302-redirects them
   to the public Supabase Storage URL so every existing reference
   keeps working without touching the stored content.

   vercel.json rewrites /uploads/:path* to this function.
   ============================================================ */
const { uploadPublicUrl } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  // only ever forward a bare object name, never a traversal path
  const raw = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || '');
  const clean = raw.replace(/^\/+/, '');

  if (!clean || clean.includes('..')) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  res.statusCode = 302;
  res.setHeader('Location', uploadPublicUrl(clean));
  // uploads are immutable (names embed a timestamp + random token)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end();
};