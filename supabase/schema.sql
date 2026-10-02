/* ============================================================
   Healing Hands — Supabase schema
   ------------------------------------------------------------
   Run this ONCE in the Supabase SQL Editor (Dashboard > SQL > New query).

   Design notes
   ------------
   * Content resources are stored as JSONB documents in one `documents`
     table, keyed by the same filenames the old Node backend used
     (doctors.json -> key 'doctors'). This is a 1:1 swap of the
     persistence layer, so the existing validation code and every
     frontend payload shape stay byte-for-byte identical.
   * `appointments`, `sessions` and `login_attempts` are real tables
     because they are queried and mutated by id, not read wholesale.

   SECURITY MODEL
   --------------
   Every read and write goes through the Vercel API functions, which use
   the SERVICE ROLE key (bypasses RLS). Therefore RLS is set to deny-all
   on every table: if the service role key ever leaks into a browser
   bundle, the anon key still cannot read or write anything directly.
   The only thing exposed to the public is the `uploads` storage bucket,
   which is public-read so <img src> works without signing.
   ============================================================ */

-- ---------------------------------------------------------------------
-- 1. Content documents (the old data/*.json files)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  key         text primary key,
  data        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table public.documents is
  'Editable content resources, keyed by former JSON filename (doctors, specialties, services, sectionCopy, clinicInfo, content, conditions, therapies, directory, blogposts, bookingoptions, passcode).';

-- ---------------------------------------------------------------------
-- 2. Appointments (the old appointments.json, now indexed)
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id          text primary key,
  created_at  timestamptz not null default now(),
  status      text not null default 'New',
  notes       text not null default '',
  name        text not null default '',
  age         text not null default '',
  mobile      text not null default '',
  email       text not null default '',
  address     text not null default '',
  city        text not null default '',
  treatment   text not null default '',
  service     text not null default '',
  complaint   text not null default '',
  date        text not null default '',
  slot        text not null default ''
);

-- newest first, matching the old `list.unshift(record)` behaviour
create index if not exists appointments_created_at_idx
  on public.appointments (created_at desc);

-- ---------------------------------------------------------------------
-- 3. Sessions
--    The old backend kept these in an in-memory Map, which serverless
--    wipes on every cold start (logging the admin out constantly).
--    Persisting them keeps the 8-hour sliding session working.
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  token       text primary key,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists sessions_expires_at_idx
  on public.sessions (expires_at);

-- ---------------------------------------------------------------------
-- 4. Login attempt counter (brute-force lockout)
--    Also in-memory before, so the 10-attempts-per-15-minutes lockout
--    was silently disabled in a serverless environment.
-- ---------------------------------------------------------------------
create table if not exists public.login_attempts (
  client_key  text primary key,
  fail_count  integer not null default 0,
  last_fail   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Content version counter
--    The frontend polls /api/version every 2s. A module-level integer
--    resets to 0 on every cold start, so live edits stop appearing.
--    One row in this table gives a durable, monotonic counter.
-- ---------------------------------------------------------------------
create table if not exists public.meta (
  key   text primary key,
  value bigint not null default 0
);

insert into public.meta (key, value) values ('data_version', 0)
  on conflict (key) do nothing;

-- atomically increment and return the new value
create or replace function public.bump_data_version()
returns bigint
language sql
as $$
  update public.meta
     set value = value + 1
   where key = 'data_version'
  returning value;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY — deny all direct client access.
-- All legitimate traffic goes through the service role from the API.
-- =====================================================================
alter table public.documents       enable row level security;
alter table public.appointments    enable row level security;
alter table public.sessions        enable row level security;
alter table public.login_attempts  enable row level security;
alter table public.meta            enable row level security;

-- No policies are created on purpose: with RLS enabled and zero policies,
-- the anon and authenticated roles can do nothing. The service role is
-- unaffected, which is exactly what the API functions use.

-- =====================================================================
-- STORAGE — public bucket for admin uploads
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- Public read so <img src="/uploads/..."> resolves without signing.
create policy "uploads are publicly readable"
  on storage.objects for select
  using (bucket_id = 'uploads');

-- Writes and deletes are NOT granted here. The upload path goes through
-- the API function with the service role, which bypasses these policies.
-- This prevents anyone from uploading arbitrary files using only the
-- public anon key.