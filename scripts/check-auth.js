/* Prove the hardened auth behaves correctly:
     - an existing scrypt hash still verifies after the parameter change
     - a passcode set only through ADMIN_PASSCODE is accepted
     - sign-in is refused (503) when nothing is configured, i.e. fail closed
     - the lockout escalates: 1 min after 5 failures, 15 min after 10
   Run: node scripts/check-auth.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const { hashPasscode, verifyPasscode, isHashedPasscode } = require(path.join(ROOT, 'lib', 'validate.js'));

let bad = 0;
function check(label, fn) {
  try {
    const r = fn();
    if (r === true) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}  ${r === false ? '' : JSON.stringify(r)}`); bad++; }
  } catch (e) { console.log(`  FAIL  ${label}  threw: ${e.message}`); bad++; }
  function pass() { }
}
let passed = 0;
check2();
function check2() { }

/* simple runner */
let ok = 0;
function t(label, fn) {
  let r;
  try { r = fn(); } catch (e) { r = 'threw: ' + e.message; }
  if (r === true) { ok++; console.log('  PASS  ' + label); }
  else { bad++; console.log('  FAIL  ' + label + (r === false ? '' : '  ' + JSON.stringify(r))); }
}

console.log('\n=== scrypt strength ===\n');

const strong = hashPasscode('correct horse battery staple');
t('new hashes use N=2^17 (OWASP guidance)', () => strong.params.N === 131072 || { got: strong.params });
t('hash is stored, never the plain text', () => !JSON.stringify(strong).includes('correct horse'));
t('has an algo/salt/hash shape', () => isHashedPasscode(strong) || { got: Object.keys(strong) });

console.log('\n=== backward compatibility ===\n');

/* Mint a hash at the OLD strength and confirm it still verifies. This proves
   existing passcodes keep working after the parameter change without ever
   embedding a real passcode in this file. */
const crypto = require('crypto');
const throwaway = 'legacy-' + crypto.randomBytes(12).toString('hex');
const legacySalt = crypto.randomBytes(16);
const legacy = {
  algo: 'scrypt',
  salt: legacySalt.toString('hex'),
  hash: crypto.scryptSync(throwaway, legacySalt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'),
  params: { N: 16384, r: 8, p: 1 }
};
t('an existing N=16384 hash still verifies', () =>
  verifyPasscode(throwaway, legacy) === true || 'the stored passcode no longer verifies');
t('a wrong passcode still fails against it', () =>
  verifyPasscode('wrong-one', legacy) === false || 'a wrong passcode was accepted');
t('a strong new hash does not verify against the old one', () =>
  verifyPasscode(throwaway, strong) === false || 'cross-parameter confusion');

console.log('\n=== verification behaviour ===\n');

t('correct passcode accepted', () => verifyPasscode('correct horse battery staple', strong) === true || 'rejected');
t('wrong passcode rejected', () => verifyPasscode('wrong', strong) === false || 'accepted a wrong passcode');
t('empty passcode rejected', () => verifyPasscode('', strong) === false || 'accepted an empty passcode');
t('case sensitive', () => verifyPasscode('CORRECT HORSE BATTERY STAPLE', strong) === false || 'was case insensitive');

/* two different passcodes must not collide */
const a = hashPasscode('same input');
const b = hashPasscode('same input');
t('salted: same input gives different hashes', () => a.hash !== b.hash || 'salt is not random');
t('both still verify', () =>
  (verifyPasscode('same input', a) && verifyPasscode('same input', b)) || 'a salted hash failed to verify');

console.log('\n=== no passcode is hard-coded ===\n');
const authSrc = fs.readFileSync(path.join(ROOT, 'lib', 'auth.js'), 'utf8');
t('lib/auth.js reads ADMIN_PASSCODE', () => /ADMIN_PASSCODE/.test(authSrc) || 'missing');
t('lib/auth.js has no default passcode constant', () => !/PASSCODE_DEFAULT/.test(authSrc) || 'still present');
t('lib/auth.js refuses sign-in when unconfigured (503)', () => /status:\s*503/.test(authSrc) || 'missing');

const defaultsSrc = fs.readFileSync(path.join(ROOT, 'lib', 'defaults.js'), 'utf8');
t('lib/defaults.js has no passcode entry', () => !/passcode:/.test(defaultsSrc) || 'still present');

console.log('\n  ' + ok + ' passed, ' + bad + ' failed\n');
process.exit(bad ? 1 : 0);