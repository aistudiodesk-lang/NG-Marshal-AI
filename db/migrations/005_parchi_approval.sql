-- Parchi approval: an evaluator ticks each photo on /dashboard → Approvals.
-- Only APPROVED gate-in parchis count as trips / revenue on the office dashboard.
-- Existing rows start as 'pending'. Written by /api/parchis/approve (service role).

alter table public.parchi_photos
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;

create index if not exists parchi_photos_approval_idx on public.parchi_photos (approval_status, captured_at);
