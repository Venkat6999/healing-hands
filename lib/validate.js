/* ============================================================
   Validation helpers — ported verbatim from server.js
   ------------------------------------------------------------
   Kept byte-identical to the Node backend so that anything the
   admin panel was allowed to save before is still allowed now.
   ============================================================ */
const crypto = require('crypto');

/* ---------- Generic editable resources ---------- */
// shape: 'array' (flat list) or 'object' (keyed structure)
const RESOURCES = {
  conditions:     { key: 'conditions',     shape: 'array',  max: 500, fields: ['name', 'img', 'symptoms'] },
  therapies:      { key: 'therapies',      shape: 'object', max: 2,   fields: ['title', 'tag', 'intro', 'items'] },
  directory:      { key: 'directory',      shape: 'object', max: 3,   fields: ['symptoms', 'therapies', 'services'] },
  blogposts:      { key: 'blogposts',      shape: 'array',  max: 200, fields: ['title', 'summary', 'body', 'tag', 'date'] },
  bookingoptions: { key: 'bookingoptions', shape: 'object', max: 4,   fields: ['cities', 'treatments', 'services', 'slots'] },
  gallery:        { key: 'gallery',        shape: 'array',  max: 200, fields: ['img', 'caption', 'alt'] }
};

function resourceDefault(name) {
  // Treatments-in-action gallery (home page, below the team). The page also
  // ships these two photos as static fallback HTML, so the API must return
  // them — never an empty list — when no gallery document exists yet.
  // Otherwise the first admin save would wipe the two visible photos.
  if (name === 'gallery') {
    return [
      { id: 'gal-cupping', img: 'images/patient-cupping-therapy.jpeg', alt: 'Patient receiving cupping therapy on the upper back and neck', caption: 'Cupping therapy for neck & upper back tightness', visible: true },
      { id: 'gal-dryneedling', img: 'images/patient-dry-needling.jpeg', alt: 'Patient receiving dry needling at the neck', caption: 'Dry needling for neck pain', visible: true }
    ];
  }
  if (name === 'therapies') {
    return { groups: [
      { id: 'basic', title: 'Basic Therapies', tag: 'Basic therapies', intro: '', visible: true, items: [] },
      { id: 'advanced', title: 'Advanced Therapies', tag: 'Advanced therapies', intro: '', visible: true, items: [] }
    ] };
  }
  if (name === 'directory') return { symptoms: [], therapies: [], services: [] };
  if (name === 'bookingoptions') return { cities: [], treatments: [], services: [], slots: [] };
  return [];
}

/** Light structural validation so a bad admin payload cannot corrupt a document. */
function validResource(name, data) {
  const cfg = RESOURCES[name];
  if (!cfg) return false;
  if (cfg.shape === 'array') {
    if (!Array.isArray(data) || data.length > cfg.max) return false;
    return data.every((item) => item && typeof item === 'object' && !Array.isArray(item) &&
      cfg.fields.every((f) => {
        const v = item[f];
        if (v === undefined) return true;
        if (Array.isArray(v)) return v.length <= 60 && v.every((x) => typeof x === 'string' && x.length <= 400);
        return typeof v === 'string' && v.length <= 6000;
      }));
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  if (keys.length > cfg.max) return false;
  return keys.every((k) => {
    const v = data[k];
    // only three shapes are ever legitimate: a list, a group object, or a string
    if (Array.isArray(v)) {
      return v.length <= 300 && v.every((item) => {
        if (typeof item === 'string') return item.length <= 400;
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        // a group (used by therapies) must carry an items array
        if (Object.prototype.hasOwnProperty.call(item, 'items')) {
          return Array.isArray(item.items) && item.items.length <= 300;
        }
        return true;
      });
    }
    if (v && typeof v === 'object') {
      return Array.isArray(v.items) && v.items.length <= 300;
    }
    if (typeof v === 'string') return v.length <= 6000;
    return false; // numbers, booleans and null are never valid here
  });
}

function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function validContentList(list, requiredFields) {
  return Array.isArray(list) && list.length <= 100 && list.every(item =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    requiredFields.every(field => validText(item[field], 2000))
  );
}

function uid(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
    Math.random().toString(36).slice(2, 7);
}

/* ---------- Passcode hashing (scrypt) ----------
   The stored passcode document holds a hash object:
     { algo:'scrypt', salt:'<hex>', hash:'<hex>', params:{N,r,p} }

   Params are stored per hash, so raising SCRYPT only affects newly created
   passcodes and any existing one keeps verifying. N=2^17 with r=8 matches the
   current OWASP guidance for scrypt and is roughly 8x the work of the previous
   N=16384.

   maxmem must be raised explicitly: Node's default 32 MB cap is below the
   128 * N * r = 128 MB that N=2^17 needs, and scryptSync would otherwise throw. */
const SCRYPT = { N: 131072, r: 8, p: 1, keylen: 64 };
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

function scrypt(plain, salt, params) {
  return crypto.scryptSync(String(plain), salt, SCRYPT.keylen, {
    N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM
  });
}

function hashPasscode(plain) {
  const salt = crypto.randomBytes(16);
  const hash = scrypt(plain, salt, SCRYPT);
  return {
    algo: 'scrypt',
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }
  };
}

function isHashedPasscode(stored) {
  return Boolean(stored && typeof stored === 'object' && stored.algo === 'scrypt' && stored.salt && stored.hash);
}

function verifyPasscode(plain, stored) {
  if (isHashedPasscode(stored)) {
    let derived;
    try {
      const params = {
        N: (stored.params && stored.params.N) || SCRYPT.N,
        r: (stored.params && stored.params.r) || SCRYPT.r,
        p: (stored.params && stored.params.p) || SCRYPT.p
      };
      // a stored hash using weaker legacy params still verifies, because the
      // parameters travel with the hash
      const legacyMax = 128 * params.N * params.r * 2 + (1024 * 1024);
      derived = crypto.scryptSync(String(plain), Buffer.from(stored.salt, 'hex'),
        SCRYPT.keylen,
        { N: params.N, r: params.r, p: params.p, maxmem: Math.max(SCRYPT_MAXMEM, legacyMax) });
    } catch (e) {
      return false;
    }
    const expected = Buffer.from(stored.hash, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }
  // legacy plaintext, kept only so a passcode can be verified once and then
  // upgraded to a hash
  return safeCompare(plain, stored);
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  RESOURCES, resourceDefault, validResource, validText, validContentList, uid,
  hashPasscode, isHashedPasscode, verifyPasscode, safeCompare
};