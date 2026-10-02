/* ============================================================
   One-time migration: ./data/*.json  ->  Supabase
   ------------------------------------------------------------
   Run this ONCE, locally, after applying supabase/schema.sql:

     node scripts/seed.js

   Add --force to overwrite documents that already exist in Supabase.
   Without it, existing documents are left alone (safe to re-run).

   Reads credentials from .env (see .env.example).
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

/* ---------- tiny .env loader (no dependency needed) ---------- */
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  });
}
loadEnv();

const { createClient } = require('@supabase/supabase-js');
const { RESOURCES, resourceDefault } = require('../api/lib/validate');
const { DEFAULTS } = require('../api/lib/defaults');

const FORCE = process.argv.includes('--force');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('\n  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Copy .env.example to .env and fill in your project values.\n');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function readJSON(file, fallback) {
  const p = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(p)) return { value: fallback, existed: false };
    return { value: JSON.parse(fs.readFileSync(p, 'utf8')), existed: true };
  } catch (err) {
    console.error(`  ! ${file}: ${err.message} — using fallback`);
    return { value: fallback, existed: false };
  }
}

/* document key -> how to obtain it */
const PLAN = [
  { key: 'doctors',      file: 'doctors.json',      fallback: () => DEFAULTS.doctors },
  { key: 'specialties',  file: 'specialties.json',  fallback: () => DEFAULTS.specialties },
  { key: 'services',     file: 'services.json',     fallback: () => DEFAULTS.services },
  { key: 'sectionCopy',  file: 'sectionCopy.json',  fallback: () => DEFAULTS.sectionCopy },
  { key: 'clinicInfo',   file: 'clinicInfo.json',   fallback: () => DEFAULTS.clinicInfo },
  { key: 'content',      file: 'content.json',      fallback: () => JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'content.default.json'), 'utf8')) },
  { key: 'passcode',     file: 'passcode.json',     fallback: () => DEFAULTS.passcode }
];

Object.keys(RESOURCES).forEach((name) => {
  PLAN.push({
    key: RESOURCES[name].key,
    file: { conditions: 'conditions.json', therapies: 'therapies.json', directory: 'directory.json',
            blogposts: 'blogposts.json', bookingoptions: 'booking-options.json' }[name],
    fallback: () => resourceDefault(name)
  });
});

async function main() {
  console.log('\n  Healing Hands — Supabase seed\n');
  console.log(`  project : ${url}`);
  console.log(`  mode    : ${FORCE ? 'overwrite existing' : 'skip existing'}`);

  // verify the schema exists before writing anything
  const probe = await supabase.from('documents').select('key').limit(1);
  if (probe.error) {
    console.error('\n  Cannot read the documents table:', probe.error.message);
    console.error('  Apply supabase/schema.sql in the Supabase SQL Editor first.\n');
    process.exit(1);
  }

  let written = 0, skipped = 0, failed = 0;

  for (const step of PLAN) {
    const { value, existed } = readJSON(step.file, step.fallback());
    if (!existed) console.log(`  ~ ${step.file} missing — seeding built-in defaults`);

    const existing = await supabase
      .from('documents').select('key').eq('key', step.key).maybeSingle();
    if (existing.error) { console.error(`  ! ${step.key}: ${existing.error.message}`); failed++; continue; }

    if (existing.data && !FORCE) { skipped++; continue; }

    const { error } = await supabase.from('documents').upsert({
      key: step.key, data: value, updated_at: new Date().toISOString()
    });
    if (error) { console.error(`  ! ${step.key}: ${error.message}`); failed++; continue; }
    written++;
    console.log(`  + ${step.key}`);
  }

  /* appointments */
  const { value: appts, existed: apptsExist } = readJSON('appointments.json', []);
  if (Array.isArray(appts) && appts.length) {
    const { data: existingRows } = await supabase
      .from('appointments').select('id').limit(1);
    if (existingRows && existingRows.length && !FORCE) {
      console.log('  ~ appointments already present — skipping (use --force to replace)');
      skipped++;
    } else {
      if (FORCE) await supabase.from('appointments').delete().neq('id', '');
      const rows = appts.filter(r => r && typeof r === 'object' && r.id).map((r) => ({
        id: r.id,
        created_at: r.createdAt || new Date().toISOString(),
        status: r.status || 'New',
        notes: r.notes || '',
        name: r.name || '', age: r.age || '', mobile: r.mobile || '',
        email: r.email || '', address: r.address || '', city: r.city || '',
        treatment: r.treatment || '', service: r.service || '',
        complaint: r.complaint || '', date: r.date || '', slot: r.slot || ''
      }));
      if (rows.length) {
        const { error } = await supabase.from('appointments').insert(rows);
        if (error) { console.error(`  ! appointments: ${error.message}`); failed++; }
        else { written++; console.log(`  + appointments (${rows.length})`); }
      }
    }
  } else {
    console.log('  ~ appointments.json empty — nothing to migrate');
  }

  /* mark the store as initialised */
  await supabase.from('meta')
    .upsert({ key: 'data_version', value: 1, }).neq('key', '___none___');
  await supabase.from('meta').upsert({ key: 'seeded_at', value: Date.now() });

  console.log(`\n  written ${written}  ·  skipped ${skipped}  ·  failed ${failed}`);
  if (failed) { console.log('\n  Some rows failed — check the messages above.\n'); process.exit(1); }
  console.log('\n  Done. Your existing content is now in Supabase.\n');
}

main().catch((err) => {
  console.error('\n  Seed failed:', err.message, '\n');
  process.exit(1);
});