-- Snapshot project parking settings when an inquiry is saved (historical).

alter table public.sales_inquiries
  add column if not exists parking_slots_available int,
  add column if not exists parking_rate_snapshot int;

comment on column public.sales_inquiries.parking_slots_available is 'projects.parking_slots copied at inquiry save time.';
comment on column public.sales_inquiries.parking_rate_snapshot is 'projects.parking_rate copied at inquiry save time.';
