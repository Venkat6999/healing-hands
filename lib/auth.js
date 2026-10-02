/* ============================================================
   Authentication & rate limiting — Supabase backed
   ------------------------------------------------------------
   The Node backend kept sessions, the login-attempt counter and the
   passcode in memory / on disk. In a serverless runtime memory is
   wiped on every cold start, which would log the admin out
   constantly and silently disable the brute-force lockout — so all
   three are persisted here instead.

   The passcode algorithm, TTLs and lockout thresholds are unchanged,
   so the admin experience is identical.
   ============================================================ */
const crypto = require('crypto');
const { getSupabase } = require('./supabase');
const { readDoc, writeDoc } = require('./store');
const { hashPasscode, isHashedPasscode, verifyPasscode } = require('./validate');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;      // 8 hours, sliding
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;        // 15 minutes

/* ---------- Passcode ---------- */

const PASSCODE_DEFAULT = 'healinghands2026';

async function readPasscode() {
  const stored = await readDoc('passcode', PASSCODE_DEFAULT);
  return stored === null || stored === undefined ? PASSCODE_DEFAULT : stored;
}

/* ---------- Sessions ---------- */

/**
 * Validate a bearer token. On success the expiry is pushed forward,
 * reproducing the sliding 8-hour window of the old Map-based session.
 * @returns {Promise<boolean>}
 */
async function verifyToken(token) {
  if (!token) return false;

  const { data, error } = await getSupabase()
    .from('sessions').select('expires_at').eq('token', token).maybeSingle();
  if (error || !data) return false;

  const expiresAt = new Date(data.expires_at).getTime();
  if (!expiresAt || expiresAt < Date.now()) {
    await getSupabase().from('sessions').delete().eq('token', token);
    return false;
  }

  await getSupabase()
    .from('sessions')
    .update({ expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
    .eq('token', token);
  return true;
}

async function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const { error } = await getSupabase().from('sessions').insert({
    token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  if (error) throw error;
  return token;
}

async function destroySession(token) {
  if (token) await getSupabase().from('sessions').delete().eq('token', token);
}

/** Housekeeping: drop expired sessions and stale counters. */
async function prune() {
  await getSupabase().from('sessions').delete().lt('expires_at', new Date().toISOString());
  await getSupabase().from('login_attempts').delete().lt('last_fail', new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString());
}

/* ---------- Login attempt lockout ---------- */

async function isRateLimited(clientKey) {
  const { data, error } = await getSupabase()
    .from('login_attempts').select('fail_count, last_fail').eq('client_key', clientKey).maybeSingle();
  if (error || !data) return false;

  const lastFail = new Date(data.last_fail).getTime();
  if (Date.now() - lastFail > ATTEMPT_WINDOW_MS) {
    // window has passed — reset
    await getSupabase().from('login_attempts')
      .update({ fail_count: 0, last_fail: new Date().toISOString() })
      .eq('client_key', clientKey);
    return false;
  }
  return data.fail_count >= MAX_ATTEMPTS;
}

async function recordFailure(clientKey) {
  const { data } = await getSupabase()
    .from('login_attempts').select('fail_count, last_fail').eq('client_key', clientKey).maybeSingle();

  const lastFail = data ? new Date(data.last_fail).getTime() : 0;
  const inWindow = data && (Date.now() - lastFail <= ATTEMPT_WINDOW_MS);
  const nextCount = inWindow ? Number(data.fail_count) + 1 : 1;

  const { error } = await getSupabase().from('login_attempts').upsert({
    client_key: clientKey,
    fail_count: nextCount,
    last_fail: new Date().toISOString()
  });
  if (error) throw error;
  return nextCount;
}

async function clearFailures(clientKey) {
  await getSupabase().from('login_attempts').delete().eq('client_key', clientKey);
}

/* ---------- Full login flow ---------- */

/**
 * @returns {{ok:true, token:string} | {ok:false, status:number, error:string}}
 */
async function attemptLogin(passcode, clientKey) {
  if (await isRateLimited(clientKey)) {
    return { ok: false, status: 429, error: 'Too many attempts. Try again later.' };
  }

  const stored = await readPasscode();
  if (!verifyPasscode(passcode, stored)) {
    await recordFailure(clientKey);
    return { ok: false, status: 401, error: 'Incorrect passcode' };
  }

  // first successful login with a legacy plaintext passcode -> upgrade it
  if (!isHashedPasscode(stored)) {
    try { await writeDoc('passcode', hashPasscode(passcode)); }
    catch (e) { console.error('passcode upgrade failed (non-fatal)', e); }
  }

  await clearFailures(clientKey);
  return { ok: true, token: await createSession() };
}

module.exports = {
  SESSION_TTL_MS, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS,
  readPasscode, verifyToken, createSession, destroySession, prune,
  isRateLimited, recordFailure, clearFailures, attemptLogin
};