-- Manual trip entries made by the approver on /dashboard → Trip details.
-- Each entry is an approved trip on its own. When a parchi photo for the SAME
-- day + container turns up (either already uploaded, or captured later), the
-- photo is auto-approved and linked here via matched_photo_id — so the trip is
-- counted once: unmatched entries count themselves, matched ones are represented
-- by the photo row.

create table if not exists public.manual_entries (
  id uuid primary key default gen_random_uuid(),
  trip_date date not null,
  driver_id text,
  driver_name text,
  container_no text not null,
  container_key text not null,          -- normalised (A-Z0-9 only) — the match key
  iso_code text,
  size_ft int,
  parchi_type text,
  cycle text,
  gate_pass_no text,
  vehicle_no text,
  revenue int,
  revenue_eligible boolean,
  entered_by text not null,
  matched_photo_id uuid references public.parchi_photos(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists manual_entries_match_idx on public.manual_entries (trip_date, container_key);
create index if not exists manual_entries_date_idx on public.manual_entries (trip_date);
