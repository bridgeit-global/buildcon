-- Optional additional buyers on a booking (denormalized for list views).
alter table public.bookings
  add column if not exists co_buyers jsonb not null default '[]'::jsonb;

comment on column public.bookings.co_buyers is
  'Additional buyers: [{"customer_id":"uuid","full_name":"…","phone":"…","email":"…"}, …]';
