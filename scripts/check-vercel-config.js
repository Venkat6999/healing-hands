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
  const client = fs.readFileSync(path.join(ROOT, 'js', 'site-data.js'), 'utf8');
  if (!/X-HH-Route/.test(client)) problems.push('js/site-data.js must send X-HH-Route');
  const admin = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
  if (!/X-HH-Route/.test(admin)) problems.push('js/admin.js must send X-HH-Route');
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