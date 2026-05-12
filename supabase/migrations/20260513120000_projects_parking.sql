-- Parking summary from project inventory structure (set at creation).

alter table public.projects
  add column if not exists parking_slots int,
  add column if not exists parking_rate int;

comment on column public.projects.parking_slots is 'Total parking slots from structure leaves at project creation.';
comment on column public.projects.parking_rate is 'Weighted average INR per parking slot (structure leaves).';
