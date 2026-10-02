/* Guard the deployment shape this project actually uses.

   Three earlier deploy cycles failed for reasons that produced no build error,
   so the build went green and the site served 404. Each of those is now
   asserted here:

     * a `build` script is fine and expected here -- the project is served as
       static files plus one Function, so a build command and an output
       directory are correct. (They were only wrong for the Express-capture
       approach that was abandoned.)
     * outputDirectory must be ".", otherwise Vercel looks for public/ and
       publishes nothing
     * no `functions` block: its keys are glob patterns in which brackets are
       a character class, which produced "doesn't match any Serverless
       Functions" on two separate deploys
     * exactly one Function must exist under api/, which keeps the deployment
       inside the Hobby limit of 12
     * every flat page URL needs a rewrite, because the markup lives in pages/
     * server.js must not exist: it is superseded by api/index.js, and leaving
       it in the repository means it gets deployed as a static file */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const problems = [];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

/* the one Function */
const apiFiles = fs.existsSync(path.join(ROOT, 'api'))
  ? fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'))
  : [];
const functionCount = apiFiles.length + (fs.existsSync(path.join(ROOT, 'api', 'lib'))
  ? fs.readdirSync(path.join(ROOT, 'api', 'lib')).filter((f) => f.endsWith('.js')).length
  : 0);

if (apiFiles.length !== 1 || !apiFiles.includes('index.js')) {
  problems.push('api/ must contain exactly index.js -- found: ' + (apiFiles.join(', ') || 'nothing'));
}
if (functionCount > 12) {
  problems.push('the Hobby plan allows 12 functions per deployment; api/ yields ' + functionCount);
}

/* static output */
if (vercel.outputDirectory !== '.') {
  problems.push('vercel.json outputDirectory must be "." -- Vercel otherwise looks for public/ and publishes nothing');
}
if (!pkg.scripts || !pkg.scripts.build) {
  problems.push('package.json needs a "build" script (the manifest generator) alongside outputDirectory');
}

/* things that previously broke the build outright */
if (vercel.functions && Object.keys(vercel.functions).length) {
  problems.push('remove the "functions" block -- its keys are globs where brackets are a character class');
}
if (Object.prototype.hasOwnProperty.call(vercel, 'framework')) {
  problems.push('remove "framework" from vercel.json -- detection is not used here and it suppresses routing');
}
if (vercel.buildCommand) {
  problems.push('remove buildCommand from vercel.json -- package.json "build" is enough');
}
if (fs.existsSync(path.join(ROOT, 'server.js'))) {
  problems.push('server.js must not exist -- it would be deployed as a static file; api/index.js replaced it');
}

/* every flat page URL needs a rewrite */
const sources = (vercel.rewrites || []).map((r) => r.source);
['/', '/index.html', '/about.html', '/services.html', '/what-we-treat.html',
  '/blog.html', '/faq.html', '/book-appointment.html', '/admin.html']
  .forEach((s) => { if (!sources.includes(s)) problems.push('vercel.json is missing a rewrite for ' + s); });

/* the Function must read the route header the client sends */
const idx = path.join(ROOT, 'api', 'index.js');
if (fs.existsSync(idx)) {
  const src = fs.readFileSync(idx, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (!/x-hh-route/i.test(src)) problems.push('api/index.js must read the x-hh-route header');
}

/* Every client file that talks to the API must send the header, and none may
   build an old-style path like API + '/content'. js/cms.js was missed once and
   every public page silently stopped applying saved content, which looked like
   "my edits are not appearing" and "the preview is broken". */
const CLIENT_API = ['cms.js', 'site-data.js', 'admin.js', 'appointment.js', 'main.js'];
const jsDir = path.join(ROOT, 'js');
if (fs.existsSync(jsDir)) {
  for (const name of CLIENT_API) {
    const f = path.join(jsDir, name);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // does this file talk to the API at all?
    const talks = /['"`]\/api['"`]/.test(code) || /\+\s*['"`]\/(content|version|doctors|specialties|services|section-copy|clinic-info|conditions|therapies|directory|blogposts|bookingoptions|auth|appointments|backup|images|reset|upload)/.test(code);
    if (!talks) continue;
    const legacy = /\+\s*(API|API_BASE)\s*\+\s*['"`]\//.test(code)
      || /fetch\s*\(\s*(API|API_BASE)\s*\+\s*['"`]\//.test(code);
    if (legacy) {
      problems.push('js/' + name + ' still builds the old API + "/endpoint" path, which 404s');
      continue;
    }
    if (!/X-HH-Route/.test(code)) {
      problems.push('js/' + name + ' calls the API but never sends X-HH-Route -- its requests will 404');
    }
  }
}

/* ---------- secrets must never be committed ----------
   The default passcode used to be hard-coded in five places, three of them in
   published documentation, which put it in the public repository. Nothing
   sensitive may live in a tracked file now. */
/* Built from fragments so this file does not itself contain the secret it
   scans for, otherwise the scan would always flag itself. */
const KNOWN_SECRETS = [['healing', 'hands', '2026'].join('')];
const SCAN_EXT = ['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.sql', '.yml', '.yaml'];

function walkForSecrets(dir, skip) {
  const hits = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + entry.name;
    if (skip.some((s) => rel.indexOf(s) === 0)) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vercel') continue;
      hits.push(...walkForSecrets(rel, skip));
    } else if (SCAN_EXT.some((e) => entry.name.endsWith(e))) {
      let text = '';
      try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { continue; }
      for (const secret of KNOWN_SECRETS) {
        if (text.includes(secret)) hits.push(rel + ' contains a hard-coded passcode');
      }
    }
  }
  return hits;
}
problems.push(...walkForSecrets('.', ['/data/', '/uploads/']));

/* the passcode must come from the environment */
const authSrc = fs.existsSync(path.join(ROOT, 'lib', 'auth.js'))
  ? fs.readFileSync(path.join(ROOT, 'lib', 'auth.js'), 'utf8') : '';
if (authSrc && !/ADMIN_PASSCODE/.test(authSrc)) {
  problems.push('lib/auth.js must read ADMIN_PASSCODE from the environment');
}
if (authSrc && !/status:\s*503/.test(authSrc)) {
  problems.push('lib/auth.js must fail closed with 503 when no passcode is configured');
}
if (authSrc && !/SOFT_LIMIT/.test(authSrc)) {
  problems.push('lib/auth.js should keep a progressive lockout (SOFT_LIMIT)');
}
if (!fs.existsSync(path.join(ROOT, '.env.example'))) {
  problems.push('.env.example is missing');
} else {
  const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  if (!/ADMIN_PASSCODE/.test(ex)) problems.push('.env.example must document ADMIN_PASSCODE');
}

console.log('\n=== deployment configuration ===\n');
console.log(`  Functions: ${functionCount} (Hobby limit 12)`);
console.log(`  api/:      ${apiFiles.join(', ') || 'nothing'}`);
console.log(`  output:    ${vercel.outputDirectory}`);
console.log(`  build:     ${(pkg.scripts || {}).build || 'none'}`);

if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log('  PROBLEM: ' + p));
  console.log('\n  ' + problems.length + ' problem(s). These fail silently at build time.\n');
  process.exit(1);
}
console.log('\n  no blocking configuration problems found.\n');