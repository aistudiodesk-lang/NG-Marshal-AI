-- Parchi photo collector + OCR (driver-app pivot #2).
-- The `parchis` storage bucket (private) is created out-of-band via the Storage API,
-- not SQL; the policy below governs anon uploads into it.
-- NOTE: applied to the live project via the Management API during the 2026-08-17 session;
-- this file documents that schema and is safe to re-run (idempotent).

create table if not exists public.parchi_photos (
  id uuid primary key default gen_random_uuid(),
  driver_id text,
  driver_name text,
  storage_path text not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- OCR fields (filled on-demand from the /parchis view; Tesseract in the browser)
  parchi_type text,
  container_no text,
  gate_pass_no text,
  cycle text,
  doc_datetime text,
  vehicle_no text,
  seal_no text,
  transporter text,
  container_valid boolean,
  ocr_raw text,
  ocr_at timestamptz
);

alter table public.parchi_photos enable row level security;

drop policy if exists parchi_anon_insert on public.parchi_photos;
create policy parchi_anon_insert on public.parchi_photos for insert to anon with check (true);

drop policy if exists parchi_anon_select on public.parchi_photos;
create policy parchi_anon_select on public.parchi_photos for select to anon using (true);

-- allow anon uploads into the private `parchis` bucket
drop policy if exists parchis_anon_insert on storage.objects;
create policy parchis_anon_insert on storage.objects for insert to anon with check (bucket_id = 'parchis');
