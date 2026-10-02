/* ============================================================
   Healing Hands — API (Vercel serverless + Supabase)
   ------------------------------------------------------------
   One catch-all function handles every /api/* route so the public
   endpoint paths and JSON response shapes are byte-for-byte the same
   as the old Express server. The frontend sets
   API_BASE = window.location.origin + '/api', so no page, script or
   style file needs to change.
   ============================================================ */
const { getSupabase } = require('./supabase');
const store = require('./store');
const auth = require('./auth');
const upload = require('./upload');
const {
  DEFAULTS, defaultContent, contentSchemaJson
} = require('./defaults');
const {
  RESOURCES, resourceDefault, validResource, validText, validContentList,
  uid, hashPasscode, verifyPasscode
} = require('./validate');

/* ---------- Response helpers ---------- */

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const ok = (res, extra) => send(res, 200, Object.assign({ ok: true }, extra || {}));
const fail = (res, status, error) => send(res, status, { error });

/* ---------- Request helpers ---------- */

/** JSON body, whether Vercel pre-parsed it or handed us a buffer. */
function readJsonBody(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const raw = Buffer.isBuffer(b) ? b.toString('utf8') : String(b);
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function requireAdmin(req, res) {
  const okAuth = await auth.verifyToken(bearerToken(req));
  if (!okAuth) { fail(res, 401, 'Admin sign-in required'); return false; }
  return true;
}

/* ---------- Write helper (mirrors saveOrFail in server.js) ---------- */

async function save(res, key, value) {
  if (!(await store.writeDoc(key, value))) {
    fail(res, 500, 'Could not save data');
    return false;
  }
  const version = await store.bumpVersion();
  return { ok: true, version };
}

/* ---------- Simple document resources ---------- */
/* Each of these is one GET (public) + one POST (admin) pair. */

const DOC_ROUTES = {
  '/api/doctors':     { fallback: () => DEFAULTS.doctors,  validate: (b) => validContentList(b, ['id', 'name', 'photo']) },
  '/api/specialties': { fallback: () => DEFAULTS.specialties, validate: (b) => validContentList(b, ['id', 'title', 'photo']) },
  '/api/services':    { fallback: () => DEFAULTS.services, validate: (b) => validContentList(b, ['id', 'title', 'description']) },
  '/api/section-copy':{ fallback: () => DEFAULTS.sectionCopy, validate: (b) => !!b && typeof b === 'object' && !Array.isArray(b) },
  '/api/clinic-info': { fallback: () => DEFAULTS.clinicInfo, validate: (b) => !!b && typeof b === 'object' && !Array.isArray(b) }
};

const GENERIC_KEYS = Object.keys(RESOURCES);

/* ---------- Appointments validation (shared by add + import) ---------- */

function validAppointmentInput(data) {
  if (!validText(data.name, 120)) return false;
  if (!validText(data.mobile, 20)) return false;
  if (!validText(data.treatment || data.service, 160)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) return false;
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return false;
  if (data.age !== undefined && data.age !== null && data.age !== '') {
    const age = Number(data.age);
    if (!Number.isInteger(age) || age < 1 || age > 120) return false;
  }
  if (!validText(data.address, 300)) return false;
  return true;
}

/* ============================================================
   Main handler
   ============================================================ */

module.exports = async function handler(req, res) {
  // --- headers (same policy as the Express app) ---
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const rawPath = (req.url || '/').split('?')[0];
  const path = rawPath.replace(/\/+$/, '') || '/api';
  const method = req.method;
  const body = () => readJsonBody(req);

  try {
    /* ---------- Auth ---------- */

    if (path === '/api/auth/check' && method === 'GET') {
      if (!(await requireAdmin(req, res))) return;
      return ok(res);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { passcode } = body();
      const result = await auth.attemptLogin(String(passcode || ''), clientIp(req));
      if (!result.ok) return fail(res, result.status, result.error);
      return ok(res, { token: result.token });
    }

    if (path === '/api/auth/change-passcode' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const { current, newPass } = body();
      const stored = await auth.readPasscode();
      if (!verifyPasscode(current, stored)) return fail(res, 401, 'Current passcode is incorrect');
      if (!validText(newPass, 128) || String(newPass).length < 8) {
        return fail(res, 400, 'New passcode must be at least 8 characters');
      }
      if (!(await store.writeDoc('passcode', hashPasscode(newPass)))) {
        return fail(res, 500, 'Could not update passcode');
      }
      return ok(res);
    }

    /* ---------- Public reads ---------- */

    if (method === 'GET' && DOC_ROUTES[path]) {
      const route = DOC_ROUTES[path];
      return send(res, 200, await store.readDoc(keyOf(path), route.fallback()));
    }

    if (method === 'GET' && GENERIC_KEYS.includes(resourceName(path))) {
      const name = resourceName(path);
      return send(res, 200, await store.readDoc(RESOURCES[name].key, resourceDefault(name)));
    }

    if (path === '/api/content' && method === 'GET') {
      const saved = await store.readDoc('content', null);
      return send(res, 200, Object.assign({}, defaultContent(), saved || {}));
    }

    if (path === '/api/content-schema' && method === 'GET') {
      return send(res, 200, contentSchemaJson());
    }

    if (path === '/api/version' && method === 'GET') {
      return send(res, 200, { version: await store.getDataVersion() });
    }

    /* ---------- Admin reads ---------- */

    if (path === '/api/images' && method === 'GET') {
      if (!(await requireAdmin(req, res))) return;
      return send(res, 200, await store.listImages());
    }

    if (path === '/api/appointments' && method === 'GET') {
      if (!(await requireAdmin(req, res))) return;
      return send(res, 200, await store.listAppointments());
    }

    /* ---------- Admin writes ---------- */

    if (method === 'POST' && DOC_ROUTES[path]) {
      if (!(await requireAdmin(req, res))) return;
      const route = DOC_ROUTES[path];
      const data = body();
      if (!route.validate(data)) return fail(res, 400, 'Invalid data for ' + keyOf(path));
      const result = await save(res, keyOf(path), data);
      if (result === false) return;
      return ok(res, { version: result.version });
    }

    if (method === 'POST' && GENERIC_KEYS.includes(resourceName(path))) {
      if (!(await requireAdmin(req, res))) return;
      const name = resourceName(path);
      const data = body();
      if (!validResource(name, data)) return fail(res, 400, 'Invalid ' + name + ' data');
      const result = await save(res, RESOURCES[name].key, data);
      if (result === false) return;
      return ok(res, { version: result.version });
    }

    if (path === '/api/content' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const data = body();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Invalid content');
      const keys = Object.keys(data);
      if (keys.length > 5000) return fail(res, 400, 'Too many fields');
      const clean = {};
      for (const key of keys) {
        const value = data[key];
        if (typeof value !== 'string') return fail(res, 400, 'Invalid value for ' + key);
        clean[key] = value.slice(0, 5000);
      }
      const result = await save(res, 'content', clean);
      if (result === false) return;
      return ok(res, { version: result.version });
    }

    if (path === '/api/content/reset' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const result = await save(res, 'content', defaultContent());
      if (result === false) return;
      return ok(res, { version: result.version });
    }

    /* ---------- Appointments ---------- */

    if (path === '/api/appointments/add' && method === 'POST') {
      // public endpoint: the booking form is not authenticated
      const data = body();
      if (!validAppointmentInput(data)) {
        return fail(res, 400, 'Please provide a valid name, mobile number, treatment and date');
      }
      const record = {
        id: uid('appt'),
        createdAt: new Date().toISOString(),
        status: 'New',
        notes: '',
        name: data.name || '',
        age: data.age === undefined || data.age === null ? '' : String(data.age),
        mobile: data.mobile || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        treatment: data.treatment || '',
        service: data.service || '',
        complaint: data.complaint || '',
        date: data.date || '',
        slot: data.slot || ''
      };
      try {
        await store.addAppointment(record);
      } catch (e) {
        console.error('appointment insert failed', e.message);
        return fail(res, 500, 'Could not save appointment');
      }
      const version = await store.bumpVersion();
      return ok(res, { record, version });
    }

    if (path === '/api/appointments' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const list = body();
      if (!Array.isArray(list)) return fail(res, 400, 'Expected array');
      const result = await save(res, 'appointments', list);
      if (result === false) return;
      return ok(res, { version: result.version });
    }

    if (path === '/api/appointments' && method === 'DELETE') {
      if (!(await requireAdmin(req, res))) return;
      try {
        await store.deleteAllAppointments();
      } catch (e) {
        return fail(res, 500, 'Could not delete appointments');
      }
      const version = await store.bumpVersion();
      return ok(res, { version });
    }

    const apptItem = /^\/api\/appointments\/([^/]+)$/.exec(path);
    if (apptItem) {
      const id = decodeURIComponent(apptItem[1]);

      if (method === 'PUT') {
        if (!(await requireAdmin(req, res))) return;
        const data = body() || {};
        const patch = {};
        ['status', 'notes'].forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            patch[key] = String(data[key]).slice(0, 1000);
          }
        });
        try {
          const row = await store.updateAppointment(id, patch);
          if (!row) return fail(res, 404, 'Not found');
        } catch (e) {
          return fail(res, 500, 'Could not update appointment');
        }
        const version = await store.bumpVersion();
        return ok(res, { version });
      }

      if (method === 'DELETE') {
        if (!(await requireAdmin(req, res))) return;
        try {
          const row = await store.deleteAppointment(id);
          if (!row) return fail(res, 404, 'Not found');
        } catch (e) {
          return fail(res, 500, 'Could not delete appointment');
        }
        const version = await store.bumpVersion();
        return ok(res, { version });
      }
    }

    /* ---------- Upload ---------- */

    if (path === '/api/upload' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      let file;
      try {
        file = await upload.readSingleImage(req);
      } catch (e) {
        return fail(res, e.statusCode || 400, e.message || 'Upload failed');
      }
      try {
        const url = await upload.storeImage(file);
        return ok(res, { url });
      } catch (e) {
        console.error('storage upload failed', e.message);
        return fail(res, 500, 'Could not store image');
      }
    }

    /* ---------- Backup / restore ---------- */

    if (path === '/api/backup' && method === 'GET') {
      if (!(await requireAdmin(req, res))) return;
      const backup = {
        exportedAt: new Date().toISOString(),
        doctors: await store.readDoc('doctors', DEFAULTS.doctors),
        specialties: await store.readDoc('specialties', DEFAULTS.specialties),
        services: await store.readDoc('services', DEFAULTS.services),
        sectionCopy: await store.readDoc('sectionCopy', DEFAULTS.sectionCopy),
        clinicInfo: await store.readDoc('clinicInfo', DEFAULTS.clinicInfo),
        appointments: await store.listAppointments(),
        content: await store.readDoc('content', defaultContent())
      };
      // include every editable list resource so a backup is truly complete
      for (const name of GENERIC_KEYS) {
        backup[name] = await store.readDoc(RESOURCES[name].key, resourceDefault(name));
      }
      res.setHeader('Content-Disposition', 'attachment; filename=healing-hands-backup.json');
      return send(res, 200, backup);
    }

    if (path === '/api/backup/import' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const payload = body();
      if (!payload || typeof payload !== 'object') return fail(res, 400, 'Invalid backup');

      if (Array.isArray(payload.doctors)) await store.writeDoc('doctors', payload.doctors);
      if (Array.isArray(payload.specialties)) await store.writeDoc('specialties', payload.specialties);
      if (Array.isArray(payload.services)) await store.writeDoc('services', payload.services);
      if (payload.sectionCopy) await store.writeDoc('sectionCopy', payload.sectionCopy);
      if (payload.clinicInfo) await store.writeDoc('clinicInfo', payload.clinicInfo);
      if (payload.content && typeof payload.content === 'object') await store.writeDoc('content', payload.content);
      for (const name of GENERIC_KEYS) {
        if (payload[name] !== undefined && validResource(name, payload[name])) {
          await store.writeDoc(RESOURCES[name].key, payload[name]);
        }
      }
      if (Array.isArray(payload.appointments)) {
        try {
          await store.deleteAllAppointments();
          for (const rec of payload.appointments) {
            if (rec && typeof rec === 'object' && rec.id) await store.addAppointment(rec);
          }
        } catch (e) {
          console.error('appointment restore failed', e.message);
        }
      }
      const version = await store.bumpVersion();
      return ok(res, { version });
    }

    if (path === '/api/reset' && method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      await store.writeDoc('doctors', DEFAULTS.doctors);
      await store.writeDoc('specialties', DEFAULTS.specialties);
      await store.writeDoc('services', DEFAULTS.services);
      await store.writeDoc('sectionCopy', DEFAULTS.sectionCopy);
      await store.writeDoc('clinicInfo', DEFAULTS.clinicInfo);
      await store.writeDoc('content', defaultContent());
      const version = await store.bumpVersion();
      return ok(res, { version });
    }

    /* ---------- Fallback ---------- */

    return fail(res, 404, 'Not found');

  } catch (err) {
    console.error('API error:', path, method, err && err.message);
    if (err && /Missing Supabase credentials/.test(err.message)) {
      return fail(res, 500, 'Server is not configured');
    }
    return fail(res, 500, 'Server error');
  }
};

/* ---------- path -> document key ---------- */

function keyOf(path) {
  switch (path) {
    case '/api/doctors': return 'doctors';
    case '/api/specialties': return 'specialties';
    case '/api/services': return 'services';
    case '/api/section-copy': return 'sectionCopy';
    case '/api/clinic-info': return 'clinicInfo';
    default: return path.slice(1);
  }
}

function resourceName(path) {
  return path.startsWith('/api/') ? path.slice(5) : '';
}

module.exports.keyOf = keyOf;