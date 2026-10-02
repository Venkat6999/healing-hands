/* ============================================================
   Persistence layer — Supabase
   ------------------------------------------------------------
   Drop-in replacement for the readJSON()/writeJSON() helpers that
   read and wrote files in ./data. The public API response shapes
   are unchanged.
   ============================================================ */
const { getSupabase, UPLOADS_BUCKET, uploadPublicUrl } = require('./supabase');
const { DEFAULTS, defaultContent, imageManifest } = require('./defaults');

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

/* ---------- Documents ---------- */

/** Read a content document, falling back when it has never been written. */
async function readDoc(key, fallback) {
  const { data, error } = await getSupabase()
    .from('documents').select('data').eq('key', key).maybeSingle();
  if (error) throw error;
  if (data === null || data === undefined) return fallback;
  return data.data;
}

/** Write a content document. Returns true on success (never throws). */
async function writeDoc(key, value) {
  const { error } = await getSupabase()
    .from('documents')
    .upsert({ key, data: value, updated_at: new Date().toISOString() });
  if (error) {
    console.error('Write error:', key, error.message);
    return false;
  }
  return true;
}

/* ---------- Version counter ---------- */

/** Durable monotonic counter (was a module-level int that reset to 0). */
async function getDataVersion() {
  const { data, error } = await getSupabase()
    .from('meta').select('value').eq('key', 'data_version').maybeSingle();
  if (error) throw error;
  return data ? Number(data.value) : 0;
}

async function bumpVersion() {
  const { data, error } = await getSupabase().rpc('bump_data_version');
  if (error) {
    // fall back to a read-modify-write if the RPC is missing
    console.error('bump_data_version failed, using fallback:', error.message);
    const current = await getDataVersion();
    const { error: e2 } = await getSupabase()
      .from('meta').upsert({ key: 'data_version', value: current + 1 });
    if (e2) throw e2;
    return current + 1;
  }
  return Number(data);
}

/* ---------- Appointments ---------- */

/* Row -> API shape. The old JSON used camelCase `createdAt`, so that is
   preserved exactly; the database column is snake_case. */
function toApi(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    notes: row.notes,
    name: row.name,
    age: row.age,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    city: row.city,
    treatment: row.treatment,
    service: row.service,
    complaint: row.complaint,
    date: row.date,
    slot: row.slot
  };
}

async function listAppointments() {
  const { data, error } = await getSupabase()
    .from('appointments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toApi);
}

async function addAppointment(record) {
  const row = Object.assign({}, record);
  row.createdAt = undefined;
  const { error } = await getSupabase().from('appointments').insert({
    id: record.id,
    created_at: record.createdAt || new Date().toISOString(),
    status: record.status || 'New',
    notes: record.notes || '',
    name: record.name || '',
    age: record.age || '',
    mobile: record.mobile || '',
    email: record.email || '',
    address: record.address || '',
    city: record.city || '',
    treatment: record.treatment || '',
    service: record.service || '',
    complaint: record.complaint || '',
    date: record.date || '',
    slot: record.slot || ''
  });
  if (error) throw error;
  return record;
}

async function updateAppointment(id, patch) {
  const row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await getSupabase()
    .from('appointments').update(row).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  return data; // null when no such row
}

async function deleteAppointment(id) {
  const { data, error } = await getSupabase()
    .from('appointments').delete().eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteAllAppointments() {
  const { error } = await getSupabase().from('appointments').delete().neq('id', '');
  if (error) throw error;
}

/* ---------- Image library ---------- */

/* Static images come from the build-time manifest; uploads are listed
   live from Storage. */
async function listImages() {
  const out = imageManifest.slice();

  const { data, error } = await getSupabase()
    .from('storage.objects')
    .select('name')
    .eq('bucket_id', UPLOADS_BUCKET);
  if (!error && Array.isArray(data)) {
    data.forEach(obj => {
      const url = uploadPublicUrl(obj.name);
      if (!out.includes(url)) out.push(url);
    });
  }
  return out;
}

/* ---------- Seed helper ---------- */

/** True when the documents table has never been populated. */
async function isEmpty() {
  const { count, error } = await getSupabase()
    .from('documents').select('key', { count: 'exact', head: true });
  if (error) throw error;
  return !count;
}

module.exports = {
  readDoc, writeDoc, getDataVersion, bumpVersion,
  listAppointments, addAppointment, updateAppointment, deleteAppointment, deleteAllAppointments,
  listImages, isEmpty, defaultContent, DEFAULTS, unwrap
};