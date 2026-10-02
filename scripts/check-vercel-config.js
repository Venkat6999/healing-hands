/* Guard the Express-on-Vercel requirements.

   Vercel turns this project into a Function only if it can find the Express
   entrypoint. Two things silently suppress that detection, and both did:

     * a `build` script in package.json -- Vercel auto-runs it and takes the
       static-build path, which expects a public/ output directory. There is
       none, so the deployment succeeds and every URL returns 404.
     * "framework": null in vercel.json -- explicitly declares that the project
       has no framework, which stops Vercel detecting Express.

   Vercel documents both as anti-patterns for an Express backend. This check
   exists because the failure mode is silent: the build goes green and the site
   404s, which is expensive to diagnose from the outside. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const problems = [];
const notes = [];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

/* 1. no `build` script */
if (pkg.scripts && pkg.scripts.build) {
  problems.push('package.json has a "build" script -- Vercel will run it and skip Express detection. ' +
    'Rename it (it is "manifest" now).');
}

/* 2. no framework: null */
if (Object.prototype.hasOwnProperty.call(vercel, 'framework')) {
  problems.push('vercel.json sets "framework" -- remove it so Vercel auto-detects Express ' +
    'from the express dependency.');
}

/* 3. no rewrites needed for an Express backend */
if (Array.isArray(vercel.rewrites) && vercel.rewrites.length) {
  problems.push('vercel.json has rewrites -- an Express backend handles its own routing; ' +
    'rewrites are unnecessary and can shadow routes.');
}

/* 4. no buildCommand needed */
if (vercel.buildCommand) {
  problems.push('vercel.json sets "buildCommand" -- remove it; Vercel builds the Function itself.');
}

/* 5. no functions block needed (and its globs are error-prone) */
if (vercel.functions && Object.keys(vercel.functions).length) {
  problems.push('vercel.json has a "functions" block -- an Express app is a single Function; ' +
    'its keys are globs and have caused build failures.');
}

/* things that must be present for detection */
if (!pkg.dependencies || !pkg.dependencies.express) {
  problems.push('express must be in package.json dependencies -- Vercel detects the framework from them.');
}

const entries = ['app', 'index', 'server', 'main', 'src/app', 'src/index', 'src/server', 'src/main'];
const found = entries.filter((e) =>
  ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'].some((ext) =>
    fs.existsSync(path.join(ROOT, e + ext))));
if (!found.length) {
  problems.push('no entrypoint file found (expected server.js at the project root)');
} else {
  notes.push('entrypoint: ' + found.join(', '));
}

const serverFile = path.join(ROOT, 'server.js');
if (fs.existsSync(serverFile)) {
  // strip comments first: the explanatory comments in server.js mention the
  // very patterns being checked for, and must not trigger a false positive
  const src = fs.readFileSync(serverFile, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (!/require\(['"]express['"]\)|from ['"]express['"]/.test(src)) {
    problems.push('server.js does not import express -- Vercel requires the entrypoint to import the framework.');
  }
  if (!/module\.exports\s*=\s*app|export default app/.test(src) && !/app\.listen\(/.test(src)) {
    problems.push('server.js neither exports the app nor calls app.listen() -- Vercel cannot detect the server.');
  }
  if (/require\.main\s*===\s*module/.test(src)) {
    problems.push('server.js guards listen() behind `require.main === module` -- Vercel imports the ' +
      'file to detect the server, so the call never happens. Call listen() at module scope.');
  }
}

console.log('\n=== Express-on-Vercel configuration ===\n');
notes.forEach((n) => console.log('  ' + n));
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log('  PROBLEM: ' + p));
  console.log('\n  ' + problems.length + ' problem(s). Vercel would build successfully and serve 404s.\n');
  process.exit(1);
}
console.log('  no blocking configuration problems found.\n');