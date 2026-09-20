/* ============================================================
   Healing Hands — Node.js / Express backend
   ------------------------------------------------------------
   Serves static files + provides REST API for all content.
   Data is stored as JSON files in ./data/ directory.
   No database required — works on any hosting with Node.js.
   ============================================================ */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

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

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve static site files
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// ---------- File upload config ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP and GIF images are allowed'));
    }
    cb(null, true);
  }
});

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
      id: 'doc-prakash', name: 'Dr. A. Prakash (PT)', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Evenings', credentials: 'BPT, FNMT, CMT',
      bio: 'Specialist in Dry Needling and Cupping Therapy. Ex-Physiotherapist at Singareni Hospitals for 7 years. 15 years of clinic experience. Advanced Pain Management and Rehabilitation Therapist.',
      bioAbout: 'Dr. Prakash is a specialist in Dry Needling and Cupping Therapy with 15 years of clinic experience, including 7 years as Physiotherapist at Singareni Hospitals. He is an Advanced Pain Management and Rehabilitation Therapist.',
      photo: 'images/doctor-prakash.jpeg', visible: true
    },
    {
      id: 'doc-kalyani', name: 'Dr. U. Kalyani (PT)', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Morning & afternoon', credentials: 'BPT, CDNT, CMT',
      bio: 'Dr. Kalyani has 12 years of experience, focusing on musculoskeletal pain, post-injury rehab and personalised exercise plans.',
      bioAbout: 'Dr. Kalyani has 12 years of experience working with patients on musculoskeletal pain, joint conditions and rehabilitation after injury, combining manual assessment with structured home exercise guidance.',
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
    { id: 'sv-neuro', title: 'Neuro Physiotherapy — Rehab', icon: 'plus', visible: true, description: 'Stroke recovery, spinal cord injury rehab, cerebral palsy management and neurological condition support.' },
    { id: 'sv-sports', title: 'Sports Physiotherapy', icon: 'tools', visible: true, description: 'Sports injury treatment, ligament rehab, return-to-play programmes and athletic performance support.' },
    { id: 'sv-paed', title: 'Paediatric Physiotherapy', icon: 'clock', visible: true, description: 'Developmental delays, cerebral palsy, torticollis, clubfoot and childhood musculoskeletal conditions.' },
    { id: 'sv-geri', title: 'Geriatric Physiotherapy', icon: 'activity', visible: true, description: 'Balance training, fall prevention, joint pain management and mobility support for older adults.' },
    { id: 'sv-home', title: 'Home Care Physiotherapy', icon: 'home', visible: true, description: 'In-home physiotherapy sessions for patients who are unable to travel to the clinic.' },
    { id: 'sv-chiro', title: 'Chiropractor Treatment', icon: 'pulse', visible: true, description: 'Spinal manipulation, joint mobilisation and musculoskeletal alignment for pain relief.' }
  ],
  sectionCopy: {
    specialties: { tag: 'Care for every stage of life', heading: 'Find the right physiotherapy for you', intro: 'Focused treatment plans for pain, mobility, rehabilitation and recovery, delivered in our clinic or at home.' },
    doctors: { tag: 'Meet the team', heading: 'The physiotherapists behind your care', intro: 'Every session at Healing Hands is led directly by one of our qualified physiotherapists — never handed off.' },
    services: { tag: 'Our services', heading: 'Services offered', intro: 'Specialised physiotherapy services delivered by qualified, experienced physiotherapists.' }
  },
  clinicInfo: {
    phone: '+918523841691', whatsapp: '918523841691',
    address: 'CANARA BANK, H, No. 1 Opp:, 7-1204, Advocates Colony, Nakkala Gutta, Hanamkonda, Telangana 506001',
    addressLine1: 'CANARA BANK, H, No. 1 Opp:, 7-1204, Advocates Colony, Nakkala Gutta', addressCity: 'Hanamkonda, Telangana 506001',
    hoursDays: 'Mon–Sat', hoursOpen: '10:00 AM', hoursClose: '8:30 PM',
    hoursFull: 'Mon–Sat, 10:00 AM – 8:30 PM', hoursShort: 'Mon–Sat: 10:00 AM – 8:30 PM'
  },
  appointments: [],
  passcode: 'healinghands2026'
};

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
  const list = readJSON('appointments.json', []);
  const record = {
    id: uid('appt'),
    createdAt: new Date().toISOString(),
    status: 'New',
    notes: '',
    name: data.name || '',
    mobile: data.mobile || '',
    email: data.email || '',
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
  const stored = readJSON('passcode.json', DEFAULTS.passcode);
  if (safeCompare(passcode, stored)) {
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
  const stored = readJSON('passcode.json', DEFAULTS.passcode);
  if (!safeCompare(current, stored)) return res.status(401).json({ error: 'Current passcode is incorrect' });
  if (!validText(newPass, 128) || newPass.length < 8) return res.status(400).json({ error: 'New passcode must be at least 8 characters' });
  if (!writeJSON('passcode.json', newPass)) return res.status(500).json({ error: 'Could not update passcode' });
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
    appointments: readJSON('appointments.json', [])
  };
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
  bumpVersion();
  res.json({ ok: true, version: dataVersion });
});

app.post('/api/reset', requireAdmin, (req, res) => {
  writeJSON('doctors.json', DEFAULTS.doctors);
  writeJSON('specialties.json', DEFAULTS.specialties);
  writeJSON('services.json', DEFAULTS.services);
  writeJSON('sectionCopy.json', DEFAULTS.sectionCopy);
  writeJSON('clinicInfo.json', DEFAULTS.clinicInfo);
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

// ---------- SPA fallback ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) return res.status(400).json({ error: err.message || 'Upload failed' });
  next();
});

app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`\n  Healing Hands server running at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
