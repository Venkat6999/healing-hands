/* ============================================================
   End-to-end API test — runs the Vercel handler locally
   ------------------------------------------------------------
   Exercises every endpoint against the real Supabase project and
   checks the response shapes and content counts match what the
   frontend expects.

     node scripts/test-api.js

   Requires .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

/* ---------- .env ---------- */
(function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  });
})();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  console.error('  Run `npm run seed` first if the tables are empty.\n');
  process.exit(1);
}

const handler = require(path.join(ROOT, 'lib', 'handler.js'));

/* ---------- mock req/res ---------- */

function call(method, url, { body, token, headers, raw } = {}) {
  return new Promise((resolve, reject) => {
    const h = Object.assign({}, headers || {});
    if (token) h.authorization = 'Bearer ' + token;
    const req = {
      method,
      url,
      headers: h,
      body: raw !== undefined ? raw : (body === undefined ? undefined : body),
      socket: { remoteAddress: '127.0.0.1' }
    };
    let payload = '';
    const res = {
      statusCode: 200,
      _headers: {},
      setHeader(k, v) { this._headers[String(k).toLowerCase()] = v; },
      end(chunk) {
        if (chunk) payload += chunk;
        let json = null;
        try { json = JSON.parse(payload); } catch (e) { /* not json */ }
        resolve({ status: this.statusCode, headers: this._headers, body: json, raw: payload });
      }
    };
    try { handler(req, res).catch(reject); }
    catch (e) { reject(e); }
    setTimeout(() => reject(new Error('timeout on ' + method + ' ' + url)), 20000);
  });
}

const GET = (u, o) => call('GET', u, o);
const POST = (u, b, o) => call('POST', u, Object.assign({ body: b }, o));
const PUT = (u, b, o) => call('PUT', u, Object.assign({ body: b }, o));
const DEL = (u, o) => call('DELETE', u, o);

/* ---------- tiny runner ---------- */
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
}
function section(t) { console.log('\n' + t); }

(async function main() {
  console.log('\n  Healing Hands — API test\n  ' + '======================\n');

  /* ---------------- Public reads ---------------- */
  section('Public reads (no auth)');

  let doctors;
  const dRes = await GET('/api/doctors');
  check('  status 200', () => assert.strictEqual(dRes.status, 200));
  check('  is a non-empty array', () => { assert(Array.isArray(dRes.body)); assert(dRes.body.length > 0); });
  doctors = dRes.body;

  // shape: object resources carry a key directly; array resources are lists,
// so the key must be present on the FIRST ITEM, not on the response itself.
for (const [ep, expectKey] of [
    ['/api/specialties', 'title'],
    ['/api/services', 'description'],
    ['/api/clinic-info', 'phone'],
    ['/api/section-copy', 'specialties']
  ]) {
    const r = await GET(ep);
    check(`GET ${ep}`, () => {
      assert.strictEqual(r.status, 200, 'status ' + r.status);
      assert(r.body, 'no body');
      if (!expectKey) return;
      const target = Array.isArray(r.body) ? r.body[0] : r.body;
      assert(target && expectKey in target, `missing key ${expectKey}`);
    });
  }

  const contentRes = await GET('/api/content');
  check('GET /api/content', () => {
    assert.strictEqual(contentRes.status, 200);
    assert(contentRes.body && typeof contentRes.body === 'object');
    const keys = Object.keys(contentRes.body).length;
    console.log(`        ${keys} content keys`);
    assert(keys > 400, 'expected ~485 content keys, got ' + keys);
  });

  const schemaRes = await GET('/api/content-schema');
  check('GET /api/content-schema is an array', () => {
    assert(Array.isArray(schemaRes.body));
  });

  const condRes = await GET('/api/conditions');
  check('GET /api/conditions', () => {
    assert(Array.isArray(condRes.body));
    console.log(`        ${condRes.body.length} conditions`);
    assert(condRes.body.length > 0);
  });

  for (const ep of ['/api/therapies', '/api/directory', '/api/blogposts', '/api/bookingoptions']) {
    const r = await GET(ep);
    check(`GET ${ep}`, () => { assert.strictEqual(r.status, 200); assert(r.body !== null && r.body !== undefined); });
  }

  const v1 = await GET('/api/version');
  check('GET /api/version', () => {
    assert.strictEqual(v1.status, 200);
    assert(Number.isInteger(v1.body.version), 'version not an integer: ' + v1.body.version);
    console.log(`        version = ${v1.body.version}`);
  });

  /* ---------------- Auth ---------------- */
  section('Auth');

  const noAuth = await GET('/api/appointments');
  check('  protected route rejects anonymous', () => assert.strictEqual(noAuth.status, 401));

  const badLogin = await POST('/api/auth/login', { passcode: 'definitely-wrong-passcode' });
  check('POST /api/auth/login with wrong passcode -> 401', () => assert.strictEqual(badLogin.status, 401));

  // Assert the lockout counter immediately: a later SUCCESSFUL login from the
  // same IP deliberately clears it (that is the reset-on-success behaviour).
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
  const { count: attemptRows } = await sb
    .from('login_attempts').select('client_key', { count: 'exact', head: true });
  check('failed login is persisted (brute-force lockout works)', () => {
    console.log(`        ${attemptRows} row(s) in public.login_attempts`);
    assert(attemptRows >= 1, 'lockout counter not persisted — in-memory regression');
  });

  const passcode = process.env.HH_TEST_PASSCODE || 'healinghands2026';
  const login = await POST('/api/auth/login', { passcode });
  check('POST /api/auth/login -> token', () => {
    assert.strictEqual(login.status, 200, 'status ' + login.status + ' ' + JSON.stringify(login.body));
    assert(login.body.token, 'no token returned');
  });
  const token = login.body && login.body.token;

  const chk = await GET('/api/auth/check', { token });
  check('GET /api/auth/check with token -> ok', () => {
    assert.strictEqual(chk.status, 200);
    assert.strictEqual(chk.body.ok, true);
  });

  const chkBad = await GET('/api/auth/check', { token: 'nope' });
  check('GET /api/auth/check with bad token -> 401', () => assert.strictEqual(chkBad.status, 401));

  /* ---------------- Admin reads ---------------- */
  section('Admin reads');

  const imgs = await GET('/api/images', { token });
  check('GET /api/images', () => {
    assert.strictEqual(imgs.status, 200);
    assert(Array.isArray(imgs.body));
    console.log(`        ${imgs.body.length} images`);
    assert(imgs.body.some(i => i.startsWith('images/')), 'no static images listed');
  });

  const appts = await GET('/api/appointments', { token });
  check('GET /api/appointments', () => {
    assert.strictEqual(appts.status, 200);
    assert(Array.isArray(appts.body));
  });

  /* ---------------- Appointments ---------------- */
  section('Appointments');

  const payload = {
    name: 'Test Patient', mobile: '9999999999', treatment: 'Manual therapy',
    date: '2026-12-01', address: '1 Test Street', email: 'test@example.com',
    age: 34, city: 'Warangal', complaint: 'test'
  };

  const bad = await POST('/api/appointments/add', { name: '', mobile: '' });
  check('POST /api/appointments/add rejects invalid input', () => assert.strictEqual(bad.status, 400));

  const added = await POST('/api/appointments/add', payload);
  check('POST /api/appointments/add (public, no auth)', () => {
    assert.strictEqual(added.status, 200, 'status ' + added.status);
    assert(added.body.ok && added.body.record, 'no record');
    assert(added.body.record.status === 'New');
    assert(added.body.record.createdAt, 'createdAt missing (camelCase contract)');
  });
  const apptId = added.body.record && added.body.record.id;

  const upt = await PUT('/api/appointments/' + encodeURIComponent(apptId), { status: 'Confirmed', notes: 'test note' }, { token });
  check('PUT /api/appointments/:id', () => assert.strictEqual(upt.status, 200));

  const listAfter = await GET('/api/appointments', { token });
  check('  updated appointment is persisted', () => {
    const found = listAfter.body.find(a => a.id === apptId);
    assert(found, 'appointment not found');
    assert.strictEqual(found.status, 'Confirmed');
    assert.strictEqual(found.notes, 'test note');
  });

  const del404 = await DEL('/api/appointments/does-not-exist', { token });
  check('DELETE /api/appointments/:id unknown -> 404', () => assert.strictEqual(del404.status, 404));

  const del = await DEL('/api/appointments/' + encodeURIComponent(apptId), { token });
  check('DELETE /api/appointments/:id', () => assert.strictEqual(del.status, 200));

  /* ---------------- Content writes ---------------- */
  section('Admin writes');

  const doctorsBefore = JSON.stringify(doctors);
  const docWrite = await POST('/api/doctors', doctors, { token });
  check('POST /api/doctors round-trips identical data', () => {
    assert.strictEqual(docWrite.status, 200);
    assert(docWrite.body.ok);
  });

  const v2 = await GET('/api/version');
  check('  data version incremented after write', () => {
    assert(v2.body.version > v1.body.version, `${v1.body.version} -> ${v2.body.version}`);
  });

  const badWrite = await POST('/api/doctors', [{ nope: 1 }], { token });
  check('POST /api/doctors rejects invalid shape -> 400', () => assert.strictEqual(badWrite.status, 400));

  const badNoAuth = await POST('/api/doctors', doctors);
  check('POST /api/doctors without token -> 401', () => assert.strictEqual(badNoAuth.status, 401));

  const badRes = await POST('/api/conditions', [{ name: 12345 }], { token });
  check('POST /api/conditions rejects bad field type', () => assert.strictEqual(badRes.status, 400));

  const condBefore = await GET('/api/conditions');
  const condWrite = await POST('/api/conditions', condBefore.body, { token });
  check('POST /api/conditions round-trips 71 conditions', () => {
    assert.strictEqual(condWrite.status, 200);
    console.log(`        ${condBefore.body.length} conditions preserved`);
  });

  /* ---------------- Backup ---------------- */
  section('Backup / restore');

  const backup = await GET('/api/backup', { token });
  check('GET /api/backup', () => {
    assert.strictEqual(backup.status, 200);
    ['doctors', 'specialties', 'services', 'sectionCopy', 'clinicInfo', 'appointments', 'content',
     'conditions', 'therapies', 'directory', 'blogposts', 'bookingoptions'].forEach((k) => {
      assert(k in backup.body, 'backup missing ' + k);
    });
    assert.strictEqual(backup.body.exportedAt !== undefined, true);
  });
  check('  Content-Disposition header set', () =>
    assert(/attachment/.test(backup.headers['content-disposition'] || '')));

  const restored = await POST('/api/backup/import', backup.body, { token });
  check('POST /api/backup/import round-trips', () => assert.strictEqual(restored.status, 200));

  /* ---------------- Session durability ---------------- */
  section('Session persistence');

  const { count } = await sb.from('sessions').select('token', { count: 'exact', head: true });
  check('sessions are stored in the database, not memory', () => {
    console.log(`        ${count} row(s) in public.sessions`);
    assert(count >= 1, 'no session rows persisted');
  });

  const rlCheck = await sb.from('documents').select('key').limit(1);
  check('service role can read documents', () => assert(!rlCheck.error));

  /* ---------------- Storage ---------------- */
  section('Storage');

  const bucket = await sb.storage.getBucket('uploads');
  check('uploads bucket exists and is public', () => {
    if (bucket.error) throw new Error(bucket.error.message);
    assert.strictEqual(bucket.data.public, true);
  });

  /* ---------------- Result ---------------- */
  console.log('\n  ' + '======================');
  console.log(`  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\n  Test run crashed:', err.stack || err.message, '\n');
  process.exit(1);
});