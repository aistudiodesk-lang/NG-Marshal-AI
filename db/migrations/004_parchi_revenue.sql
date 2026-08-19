-- Parchi revenue: size (from ISO code first digit) + computed revenue per photo.
-- Revenue rule: GATE-IN passes only (import gate-in + export gate-in); 20ft (ISO starts
-- with 2) = ₹60, 40ft (starts with 4) = ₹90. Computed server-side in /api/parchis/extract.
-- Applied to the live project via the Management API during the 2026-08-18 session.

alter table public.parchi_photos
  add column if not exists iso_code text,
  add column if not exists size_ft int,
  add column if not exists revenue int,
  add column if not exists revenue_eligible boolean;
