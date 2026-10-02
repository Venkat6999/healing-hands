/* Guard against the bug that broke the Vercel build twice:
   a bare `uploads/` in .gitignore also matches api/uploads/, which is where a
   Serverless Function lives. The file then vanishes from the repository and
   Vercel reports "pattern doesn't match any Serverless Functions".

   Run as part of `npm test` so it can never regress silently.
   Exits non-zero if any file under api/ is not tracked by git. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'C:\\Users\\nvnre\\Downloads\\healing-hands-site\\healing-hands-site\\healing-hands-site';

let tracked = new Set();
try {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  tracked = new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
} catch (e) {
  console.log('  (not a git repository - skipping)');
  process.exit(0);
}

// every file Vercel will treat as a Serverless Function
const functions = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.js')) functions.push(rel);
  }
})('api');

const missing = functions.filter((f) => !tracked.has(f));

console.log(`\n  Serverless Functions found: ${functions.length}`);
functions.forEach((f) => console.log(`    ${tracked.has(f) ? 'tracked  ' : 'MISSING!'} ${f}`));

if (missing.length) {
  console.log(`\n  !! ${missing.length} function(s) are NOT in git and will not deploy:`);
  missing.forEach((f) => console.log(`     ${f}`));
  console.log('     Check .gitignore for an over-broad pattern such as `uploads/`.');
  process.exit(1);
}

console.log('\n  All functions are tracked by git.\n');