/* ============================================================
   Healing Hands — Node.js / Express backend  (LEGACY)
   ------------------------------------------------------------
   Superseded by the Vercel + Supabase backend in ../api/.
   Kept only for offline comparison; not used in production.

   Serves static files + provides REST API for all content.
   Data is stored as JSON files in ../data/ directory.
   ============================================================ */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// this file lives in legacy/, so the site it serves is one level up
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Middleware ----------
app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ---------- Security headers ----------
// must be registered BEFORE the static handlers, otherwise files are
// served before these headers are ever applied
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve static site files
app.use(express.static(ROOT, {
  index: 'index.html',
  extensions: ['html']
}));

// ---------- File upload config ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // never trust the client filename: rebuild it from a timestamp + random token,
    // and force a known-good extension so a crafted name cannot escape UPLOAD_DIR
    const allowedExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
    const ext = allowedExt[file.mimetype] || '.bin';
    const name = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // SVG is deliberately NOT allowed: an SVG is a script-capable document and
    // these are served from the site's own origin, so it would be stored XSS.
    if (!/^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, GIF and AVIF images are allowed'));
    }
    cb(null, true);
  }
});

// Serve uploaded files with hardening headers
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  next();
}, express.static(UPLOAD_DIR));

// ---------- JSON file helpers ----------
function readJSON(filename, fallback) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filepath)) return fallback;
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Read error:', filename, err.message);
    return fallback;
  }
}

function writeJSON(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  const tempPath = filepath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filepath);
    return true;
  } catch (err) {
    console.error('Write error:', filename, err.message);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) { /* ignore cleanup failure */ }
    return false;
  }
}

function saveOrFail(res, filename, data) {
  if (!writeJSON(filename, data)) {
    res.status(500).json({ error: 'Could not save data' });
    return false;
  }
  bumpVersion();
  return true;
}

const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;
const loginAttempts = new Map();

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expiresAt = sessions.get(token);
  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Admin sign-in required' });
  }
  sessions.set(token, Date.now() + SESSION_TTL);
  next();
}

function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Passcode hashing (scrypt) ----------
// passcode.json may hold EITHER a plain string (legacy) or a hash object.
// Legacy values are migrated to a hash the first time they are used.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPasscode(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p
  });
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
      derived = crypto.scryptSync(String(plain), Buffer.from(stored.salt, 'hex'), SCRYPT.keylen, {
        N: (stored.params && stored.params.N) || SCRYPT.N,
        r: (stored.params && stored.params.r) || SCRYPT.r,
        p: (stored.params && stored.params.p) || SCRYPT.p
      });
    } catch (e) {
      return false;
    }
    const expected = Buffer.from(stored.hash, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }
  // legacy plaintext
  return safeCompare(plain, stored);
}

function readPasscode() {
  return readJSON('passcode.json', DEFAULTS.passcode);
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

// ---------- Default data ----------
const DEFAULTS = {
  doctors: [
    {
      id: 'doc-prakash', name: 'Dr. A. Prakash', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Evenings', credentials: 'BPT, PIAP, CMT',
      bio: 'Dr. Prakash is specialised in Dry Needling, Advanced pain management and pelvic floor rehabilitation therapies.',
      bioAbout: 'Dr. Prakash is specialised in Dry Needling, Advanced pain management and pelvic floor rehabilitation therapies.',
      photo: 'images/doctor-prakash.jpeg', visible: true
    },
    {
      id: 'doc-kalyani', name: 'Dr. U. Kalyani', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Morning & afternoon', credentials: 'BPT, MIAP',
      bio: 'Dr. Kalyani sees patients through the day, focusing on musculoskeletal pain, post-injury rehab and personalised exercise plans.',
      bioAbout: 'Dr. Kalyani works with patients on musculoskeletal pain, joint conditions and rehabilitation after injury, combining manual assessment with structured home exercise guidance.',
      photo: 'images/doctor-kalyani.jpeg', visible: true
    }
  ],
  specialties: [
    { id: 'sp-neuro', title: 'Neuro Physiotherapy — Rehab', photo: 'images/doctor-prakash.jpeg', alt: 'Physiotherapist providing attentive care', visible: true },
    { id: 'sp-sports', title: 'Sports Physiotherapy', photo: 'images/treatment-room-1.jpeg', alt: 'Prepared physiotherapy treatment room', visible: true },
    { id: 'sp-paed', title: 'Paediatric Physiotherapy', photo: 'images/gym-room.jpeg', alt: 'Rehabilitation gym with walking bars', visible: true },
    { id: 'sp-geri', title: 'Geriatric Physiotherapy', photo: 'images/doctor-kalyani.jpeg', alt: 'Healing Hands physiotherapist', visible: true },
    { id: 'sp-home', title: 'Home Care Physiotherapy', photo: 'images/treatment-room-2.jpeg', alt: 'Clinic treatment area', visible: true },
    { id: 'sp-chiro', title: 'Chiropractor Treatment', photo: 'images/treatment-room-3.jpeg', alt: 'Quiet physiotherapy consultation room', visible: true }
  ],
  services: [
    { id: 'sv-basic', title: 'Basic treatment (any two electrotherapy modalities)', icon: 'plus', visible: true, description: 'Includes IFT, Ultrasound, TENS, Stimulator, Hydrocollator packs, Traction, Infrared radiation and Taping — any two modalities per session.', price: '400' },
    { id: 'sv-manual', title: 'Manual therapy', icon: 'tools', visible: true, description: 'Hands-on techniques including joint mobilisation, manipulation and soft tissue work to restore movement and reduce pain.', price: '500' },
    { id: 'sv-cupping', title: 'Cupping therapy', icon: 'clock', visible: true, description: 'An ancient healing practice with a strong place in modern physiotherapy — used for pain relief, muscle recovery and improving blood flow.', price: '600' },
    { id: 'sv-dryneedle', title: 'Dry needle therapy', icon: 'pulse', visible: true, description: 'Also known as Trigger Point Dry Needling — a procedure using thin needles to release myofascial trigger points and relieve muscle pain.', price: '800' }
  ],
  sectionCopy: {
    specialties: { tag: 'Care for every stage of life', heading: 'Find the right physiotherapy for you', intro: 'Focused treatment plans for pain, mobility, rehabilitation and recovery, delivered in our clinic or at home.' },
    doctors: { tag: 'Meet the team', heading: 'The physiotherapists behind your care', intro: 'Every session at Healing Hands is led directly by one of our qualified physiotherapists — never handed off.' },
    services: { tag: 'Our treatments', heading: 'Treatment', intro: 'Better movement. Better recovery. Better life. Personalized, hands-on physiotherapy for pain management, better movement and lasting recovery.' }
  },
  clinicInfo: {
    phone: '+918523841691', whatsapp: '918523841691',
    address: "H.No: 1-7-1204, Advocate's Colony Main Road, Opposite: Canara Bank, Beside: Blue Star A/C Showroom, Balasamudram, Hanamkonda, Telangana 506001",
    addressLine1: "H.No: 1-7-1204, Advocate's Colony Main Road", addressCity: 'Hanamkonda, Warangal, Telangana 506001',
    hoursDays: 'Mon-Sun', hoursOpen: '10:00 AM', hoursClose: '8:30 PM',
    hoursFull: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM', hoursShort: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM'
  },
  appointments: [],
};

// ---------- Generic editable resources ----------
// Each resource is a JSON file the client can fully manage from the admin panel.
// shape: 'array' (flat list) or 'object' (keyed structure)
const RESOURCES = {
  conditions:      { file: 'conditions.json',      shape: 'array',  max: 500, fields: ['name', 'img', 'symptoms'] },
  therapies:       { file: 'therapies.json',       shape: 'object', max: 2,   fields: ['title', 'tag', 'intro', 'items'] },
  directory:       { file: 'directory.json',       shape: 'object', max: 3,   fields: ['symptoms', 'therapies', 'services'] },
  blogposts:       { file: 'blogposts.json',       shape: 'array',  max: 200, fields: ['title', 'summary', 'body', 'tag', 'date'] },
  bookingoptions:  { file: 'booking-options.json', shape: 'object', max: 4,   fields: ['cities', 'treatments', 'services', 'slots'] }
};

function resourceDefault(name) {
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

// light structural validation so a bad admin payload cannot corrupt the file
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

Object.keys(RESOURCES).forEach((name) => {
  const cfg = RESOURCES[name];
  // make sure the file exists on first boot
  if (!fs.existsSync(path.join(DATA_DIR, cfg.file))) {
    writeJSON(cfg.file, resourceDefault(name));
  }

  // public read (the public pages need it to render)
  app.get('/api/' + name, (req, res) => {
    res.json(readJSON(cfg.file, resourceDefault(name)));
  });

  // admin write
  app.post('/api/' + name, requireAdmin, (req, res) => {
    const data = req.body;
    if (!validResource(name, data)) {
      return res.status(400).json({ error: 'Invalid ' + name + ' data' });
    }
    if (!saveOrFail(res, cfg.file, data)) return;
    res.json({ ok: true, version: dataVersion });
  });
});

// ---------- Initialize data files if missing ----------
function initData() {
  ['doctors', 'specialties', 'services', 'sectionCopy', 'clinicInfo', 'appointments'].forEach(key => {
    const file = key + '.json';
    if (!fs.existsSync(path.join(DATA_DIR, file))) {
      writeJSON(file, DEFAULTS[key]);
    }
  });
  if (!fs.existsSync(path.join(DATA_DIR, 'passcode.json'))) {
    writeJSON('passcode.json', DEFAULTS.passcode);
  }
}
initData();

// Version counter — increments on every write so frontend can poll for changes
let dataVersion = 0;
function bumpVersion() { dataVersion++; }

// ---------- API: Doctors ----------
app.get('/api/doctors', (req, res) => {
  res.json(readJSON('doctors.json', DEFAULTS.doctors));
});

app.post('/api/doctors', requireAdmin, (req, res) => {
  const list = req.body;
  if (!validContentList(list, ['id', 'name', 'photo'])) return res.status(400).json({ error: 'Invalid doctors data' });
  if (!saveOrFail(res, 'doctors.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Specialties ----------
app.get('/api/specialties', (req, res) => {
  res.json(readJSON('specialties.json', DEFAULTS.specialties));
});

app.post('/api/specialties', requireAdmin, (req, res) => {
  const list = req.body;
  if (!validContentList(list, ['id', 'title', 'photo'])) return res.status(400).json({ error: 'Invalid specialties data' });
  if (!saveOrFail(res, 'specialties.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Services ----------
app.get('/api/services', (req, res) => {
  res.json(readJSON('services.json', DEFAULTS.services));
});

app.post('/api/services', requireAdmin, (req, res) => {
  const list = req.body;
  if (!validContentList(list, ['id', 'title', 'description'])) return res.status(400).json({ error: 'Invalid services data' });
  if (!saveOrFail(res, 'services.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Section Copy ----------
app.get('/api/section-copy', (req, res) => {
  res.json(readJSON('sectionCopy.json', DEFAULTS.sectionCopy));
});

app.post('/api/section-copy', requireAdmin, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Invalid section copy' });
  if (!saveOrFail(res, 'sectionCopy.json', req.body)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Clinic Info ----------
app.get('/api/clinic-info', (req, res) => {
  res.json(readJSON('clinicInfo.json', DEFAULTS.clinicInfo));
});

app.post('/api/clinic-info', requireAdmin, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Invalid clinic information' });
  if (!saveOrFail(res, 'clinicInfo.json', req.body)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Page content (every text / image / background) ----------
function defaultContent() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'content.default.json'), 'utf8')); }
  catch (err) { return {}; }
}

app.get('/api/content', (req, res) => {
  const saved = readJSON('content.json', null);
  res.json(Object.assign({}, defaultContent(), saved || {}));
});

app.get('/api/content-schema', (req, res) => {
  res.json(readJSON('content-schema.json', []));
});

app.post('/api/content', requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid content' });
  const keys = Object.keys(body);
  if (keys.length > 5000) return res.status(400).json({ error: 'Too many fields' });
  const clean = {};
  for (const key of keys) {
    const value = body[key];
    if (typeof value !== 'string') return res.status(400).json({ error: 'Invalid value for ' + key });
    clean[key] = value.slice(0, 5000);
  }
  if (!saveOrFail(res, 'content.json', clean)) return;
  res.json({ ok: true, version: dataVersion });
});

app.post('/api/content/reset', requireAdmin, (req, res) => {
  if (!saveOrFail(res, 'content.json', defaultContent())) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Image library ----------
app.get('/api/images', requireAdmin, (req, res) => {
  const out = [];
  const walk = (dir, prefix) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { return; }
    entries.forEach(entry => {
      if (entry.name.startsWith('.')) return;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel + '/');
      if (/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(entry.name)) out.push(rel);
    });
  };
  walk(path.join(ROOT, 'images'), 'images/');
  walk(UPLOAD_DIR, '/uploads/');
  res.json(out);
});

// ---------- API: Appointments ----------
app.get('/api/appointments', requireAdmin, (req, res) => {
  res.json(readJSON('appointments.json', DEFAULTS.appointments));
});

app.post('/api/appointments', requireAdmin, (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Expected array' });
  if (!saveOrFail(res, 'appointments.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

app.post('/api/appointments/add', (req, res) => {
  const data = req.body || {};
  if (!validText(data.name, 120) || !validText(data.mobile, 20) || !validText(data.treatment || data.service, 160) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) {
    return res.status(400).json({ error: 'Please provide a valid name, mobile number, treatment and date' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ error: 'Invalid email address' });
  if (data.age !== undefined && data.age !== null && data.age !== '') {
    const age = Number(data.age);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      return res.status(400).json({ error: 'Please provide a valid age between 1 and 120' });
    }
  }
  if (!validText(data.address, 300)) {
    return res.status(400).json({ error: 'Please provide your address' });
  }
  const list = readJSON('appointments.json', []);
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
  list.unshift(record);
  if (!saveOrFail(res, 'appointments.json', list)) return;
  res.json({ ok: true, record, version: dataVersion });
});

app.put('/api/appointments/:id', requireAdmin, (req, res) => {
  const list = readJSON('appointments.json', []);
  const item = list.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const allowed = ['status', 'notes'];
  allowed.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) item[key] = String(req.body[key]).slice(0, 1000);
  });
  if (!saveOrFail(res, 'appointments.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

app.delete('/api/appointments/:id', requireAdmin, (req, res) => {
  let list = readJSON('appointments.json', []);
  const before = list.length;
  list = list.filter(i => i.id !== req.params.id);
  if (list.length === before) return res.status(404).json({ error: 'Not found' });
  if (!saveOrFail(res, 'appointments.json', list)) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Auth ----------
app.get('/api/auth/check', (req, res) => {
  requireAdmin(req, res, () => res.json({ ok: true }));
});

app.post('/api/auth/login', (req, res) => {
  const clientKey = req.ip || 'unknown';
  const attempt = loginAttempts.get(clientKey) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (attempt.resetAt < Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
  if (attempt.count >= 10) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const passcode = String((req.body || {}).passcode || '');
  const stored = readPasscode();
  if (verifyPasscode(passcode, stored)) {
    // first successful login with a legacy plaintext passcode -> upgrade it to a hash
    if (!isHashedPasscode(stored)) {
      try { writeJSON('passcode.json', hashPasscode(passcode)); } catch (e) { /* non-fatal */ }
    }
    loginAttempts.delete(clientKey);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    res.json({ ok: true, token });
  } else {
    attempt.count++;
    loginAttempts.set(clientKey, attempt);
    res.status(401).json({ error: 'Incorrect passcode' });
  }
});

app.post('/api/auth/change-passcode', requireAdmin, (req, res) => {
  const { current, newPass } = req.body;
  const stored = readPasscode();
  if (!verifyPasscode(current, stored)) return res.status(401).json({ error: 'Current passcode is incorrect' });
  if (!validText(newPass, 128) || newPass.length < 8) return res.status(400).json({ error: 'New passcode must be at least 8 characters' });
  if (!writeJSON('passcode.json', hashPasscode(newPass))) return res.status(500).json({ error: 'Could not update passcode' });
  res.json({ ok: true });
});

// ---------- API: Version (for polling) ----------
app.get('/api/version', (req, res) => {
  res.json({ version: dataVersion });
});

// ---------- API: Backup / Restore ----------
app.get('/api/backup', requireAdmin, (req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    doctors: readJSON('doctors.json', DEFAULTS.doctors),
    specialties: readJSON('specialties.json', DEFAULTS.specialties),
    services: readJSON('services.json', DEFAULTS.services),
    sectionCopy: readJSON('sectionCopy.json', DEFAULTS.sectionCopy),
    clinicInfo: readJSON('clinicInfo.json', DEFAULTS.clinicInfo),
    appointments: readJSON('appointments.json', []),
    content: readJSON('content.json', defaultContent())
  };
  // include every editable list resource so a backup is truly complete
  Object.keys(RESOURCES).forEach((name) => {
    backup[name] = readJSON(RESOURCES[name].file, resourceDefault(name));
  });
  res.setHeader('Content-Disposition', 'attachment; filename=healing-hands-backup.json');
  res.json(backup);
});

app.post('/api/backup/import', requireAdmin, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Invalid backup' });
  if (Array.isArray(payload.doctors)) writeJSON('doctors.json', payload.doctors);
  if (Array.isArray(payload.specialties)) writeJSON('specialties.json', payload.specialties);
  if (Array.isArray(payload.services)) writeJSON('services.json', payload.services);
  if (payload.sectionCopy) writeJSON('sectionCopy.json', payload.sectionCopy);
  if (payload.clinicInfo) writeJSON('clinicInfo.json', payload.clinicInfo);
  if (Array.isArray(payload.appointments)) writeJSON('appointments.json', payload.appointments);
  if (payload.content && typeof payload.content === 'object') writeJSON('content.json', payload.content);
  Object.keys(RESOURCES).forEach((name) => {
    if (payload[name] !== undefined && validResource(name, payload[name])) {
      writeJSON(RESOURCES[name].file, payload[name]);
    }
  });
  bumpVersion();
  res.json({ ok: true, version: dataVersion });
});

app.post('/api/reset', requireAdmin, (req, res) => {
  writeJSON('doctors.json', DEFAULTS.doctors);
  writeJSON('specialties.json', DEFAULTS.specialties);
  writeJSON('services.json', DEFAULTS.services);
  writeJSON('sectionCopy.json', DEFAULTS.sectionCopy);
  writeJSON('clinicInfo.json', DEFAULTS.clinicInfo);
  writeJSON('content.json', defaultContent());
  bumpVersion();
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: Delete all appointments ----------
app.delete('/api/appointments', requireAdmin, (req, res) => {
  if (!saveOrFail(res, 'appointments.json', [])) return;
  res.json({ ok: true, version: dataVersion });
});

// ---------- API: File upload ----------
app.post('/api/upload', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = '/uploads/' + req.file.filename;
  res.json({ ok: true, url });
});

// ---------- Page aliases ----------
// The HTML pages live in pages/, but the public URLs stay flat
// (/about.html, not /pages/about.html). These routes reproduce the
// rewrites declared in vercel.json so local runs match production.
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

// ---------- SPA fallback ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) return res.status(400).json({ error: err.message || 'Upload failed' });
  next();
});

app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(ROOT, 'pages', 'index.html'));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`\n  Healing Hands server running at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
