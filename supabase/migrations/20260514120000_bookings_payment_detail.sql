-- Mode-specific payment references (UPI UTR, cheque no., NEFT ref, etc.)
alter table public.bookings
  add column if not exists payment_detail jsonb not null default '{}'::jsonb;

comment on column public.bookings.payment_detail is
  'Optional refs keyed by mode: utr, cheque_number, neft_ref';
