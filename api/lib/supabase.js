/* ============================================================
   Supabase client (server-side only)
   ------------------------------------------------------------
   Uses the SERVICE ROLE key, which bypasses RLS. Never expose
   this module's env vars to the browser.
   ============================================================ */
const { createClient } = require('@supabase/supabase-js');

let cached = null;

function getSupabase() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in the environment (see .env.example).'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'healing-hands-api' } }
  });
  return cached;
}

const UPLOADS_BUCKET = 'uploads';

/** Public base URL for a stored upload, e.g. /uploads/abc-123.jpg */
function uploadUrl(path) {
  return '/uploads/' + String(path).replace(/^\/+/, '');
}

/** Absolute Supabase URL for a stored upload (used for the image library) */
function uploadPublicUrl(path) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  return base + '/storage/v1/object/public/' + UPLOADS_BUCKET + '/' +
    String(path).replace(/^\/+/, '');
}

module.exports = { getSupabase, UPLOADS_BUCKET, uploadUrl, uploadPublicUrl };