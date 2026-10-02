/* ============================================================
   Authentication & rate limiting - Supabase backed
   ------------------------------------------------------------
   Sessions, the passcode and the brute-force lockout are all persisted.

   There is NO default passcode in this codebase. The first one is taken from
   the ADMIN_PASSCODE environment variable and hashed into the database on
   first use; after that it is changed from the admin panel, which keeps only
   its scrypt hash. If ADMIN_PASSCODE is unset and the database has no
   passcode yet, sign-in is refused outright rather than falling back to a
   value that is published in the repository.

   The lockout is progressive: 5 failures buys a 1 minute pause, 10 buys 15
   minutes, and the window is measured from the last failure.
   ============================================================ */
const crypto = require('crypto');
const { getSupabase } = require('./supabase');
const { readDoc, writeDoc } = require('./store');
const { hashPasscode, isHashedPasscode, verifyPasscode } = require('./validate');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;      // 8 hours, sliding

/* progressive lockout, keyed off the stored failure count */
const SOFT_LIMIT = 5;
const HARD_LIMIT = 10;
const SOFT_LOCK_MS = 60 * 1000;                 // 1 minute
const HARD_LOCK_MS = 15 * 60 * 1000;            // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;        // counter forgets after 15 min

/* ---------- Passcode ---------- */

/** True when a passcode exists in the database already. */
async function hasPasscode() {
  const stored = await readDoc('passcode', null);
  return stored !== null && stored !== undefined;
}

/**
 * The stored passcode hash. On a completely fresh database it is created from
 * ADMIN_PASSCODE the first time it is needed, so the value never has to live
 * in the repository. Returns null when nothing is configured.
 */
async function readPasscode() {
  const stored = await readDoc('passcode', null);
  if (stored !== null && stored !== undefined) return stored;

  const initial = process.env.ADMIN_PASSCODE;
  if (!initial) return null;

  if (String(initial).length < 12) {
    console.warn('[auth] ADMIN_PASSCODE is shorter than 12 characters - use something longer');
  }
  const hash = hashPasscode(initial);
  await writeDoc('passcode', hash);
  console.log('[auth] passcode initialised from ADMIN_PASSCODE');
  return hash;
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

/* ---------- Login attempt lockout ----------
   Progressive: the longer someone keeps guessing, the longer they wait. The
   window runs from the last failure, so a paused attacker has to start over. */

function lockMsFor(count) {
  if (count >= HARD_LIMIT) return HARD_LOCK_MS;
  if (count >= SOFT_LIMIT) return SOFT_LOCK_MS;
  return 0;
}

/** @returns {Promise<{locked:boolean, retryInMs:number}>} */
async function isRateLimited(clientKey) {
  const { data, error } = await getSupabase()
    .from('login_attempts').select('fail_count, last_fail').eq('client_key', clientKey).maybeSingle();
  if (error || !data) return { locked: false, retryInMs: 0 };

  const count = Number(data.fail_count) || 0;
  const lastFail = new Date(data.last_fail).getTime();
  const lock = lockMsFor(count);
  if (!lock) return { locked: false, retryInMs: 0 };

  const until = lastFail + lock;
  if (Date.now() < until) return { locked: true, retryInMs: until - Date.now() };
  return { locked: false, retryInMs: 0 };
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
  const limit = await isRateLimited(clientKey);
  if (limit.locked) {
    const mins = Math.max(1, Math.ceil(limit.retryInMs / 60000));
    return {
      ok: false, status: 429,
      error: 'Too many failed attempts. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.'
    };
  }

  const stored = await readPasscode();
  if (!stored) {
    // fail closed: ADMIN_PASSCODE is unset and the database has no passcode yet
    return {
      ok: false, status: 503,
      error: 'Admin sign-in is not configured. Set ADMIN_PASSCODE in the environment.'
    };
  }

  if (!verifyPasscode(passcode, stored)) {
    await recordFailure(clientKey);
    return { ok: false, status: 401, error: 'Incorrect passcode' };
  }

  // a legacy plaintext passcode is upgraded to a hash on first successful use
  if (!isHashedPasscode(stored)) {
    try { await writeDoc('passcode', hashPasscode(passcode)); }
    catch (e) { console.error('passcode upgrade failed (non-fatal)', e); }
  }

  await clearFailures(clientKey);
  return { ok: true, token: await createSession() };
}
module.exports = {
  SESSION_TTL_MS, SOFT_LIMIT, HARD_LIMIT, SOFT_LOCK_MS, HARD_LOCK_MS, ATTEMPT_WINDOW_MS,
  hasPasscode, readPasscode, verifyToken, createSession, destroySession, prune,
  isRateLimited, recordFailure, clearFailures, attemptLogin
};
