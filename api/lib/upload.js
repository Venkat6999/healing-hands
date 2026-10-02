/* ============================================================
   Image uploads — Supabase Storage
   ------------------------------------------------------------
   Replaces multer.diskStorage, which wrote to ./uploads and cannot
   work on a read-only serverless filesystem.

   Size limit note: Vercel rejects request bodies larger than 4.5 MB,
   so MAX_BYTES here is 4 MB rather than the previous 10 MB. The
   largest image currently in the site is 2.7 MB, so this does not
   change anything the client is actually uploading today.
   ============================================================ */
const crypto = require('crypto');
const Busboy = require('busboy');
const { getSupabase, UPLOADS_BUCKET, uploadUrl } = require('./supabase');

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

// SVG is deliberately NOT allowed: an SVG is a script-capable document and
// these are served from the site's own origin, so it would be stored XSS.
const ALLOWED = /^image\/(jpeg|jpg|png|webp|gif|avif)$/;

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif'
};

function multerStyleError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Buffer a multipart/form-data request, enforcing type and size. */
function readSingleImage(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: MAX_BYTES }
      });
    } catch (e) {
      return reject(multerStyleError('Invalid upload request'));
    }

    let found = null;
    let tooLarge = false;
    let settled = false;

    const fail = (err) => { if (!settled) { settled = true; reject(err); } };
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    bb.on('file', (field, stream, info) => {
      if (field !== 'photo') { stream.resume(); return; }

      if (!ALLOWED.test(info.mimeType)) {
        stream.resume();
        return fail(multerStyleError('Only JPG, PNG, WEBP, GIF and AVIF images are allowed'));
      }

      const chunks = [];
      let bytes = 0;

      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          tooLarge = true;
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });

      stream.on('limit', () => { tooLarge = true; });

      stream.on('end', () => {
        if (tooLarge) {
          return fail(multerStyleError('Image is too large (maximum 4 MB)'));
        }
        found = {
          buffer: Buffer.concat(chunks),
          mimetype: info.mimeType,
          bytes
        };
      });
    });

    bb.on('error', () => fail(multerStyleError('Upload failed')));
    bb.on('close', () => {
      if (!found) return fail(multerStyleError('No file uploaded'));
      done(found);
    });

    // pipe whatever body Vercel already buffered, else the raw stream
    if (Buffer.isBuffer(req.body) && req.body.length) {
      bb.end(req.body);
    } else {
      req.pipe(bb);
    }
  });
}

/**
 * Store the uploaded image and return the site-relative URL.
 * Never trusts the client filename: it is rebuilt from the MIME type
 * plus a random token, so a crafted name cannot escape the bucket.
 */
async function storeImage(file) {
  const ext = EXT_BY_MIME[file.mimetype] || '.bin';
  const name = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;

  const { error } = await getSupabase()
    .storage.from(UPLOADS_BUCKET)
    .upload(name, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '31536000' // one year; filenames are content-unique
    });
  if (error) throw error;

  return uploadUrl(name);
}

module.exports = { readSingleImage, storeImage, MAX_BYTES };