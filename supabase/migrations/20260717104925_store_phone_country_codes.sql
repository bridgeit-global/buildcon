-- Persist the dial code selected alongside each stored phone number.
-- Existing records default to India to preserve the current form behavior.

alter table public.customers
  add column if not exists phone_country text not null default '+91',
  add column if not exists phone_secondary_country text not null default '+91';

alter table public.brokers
  add column if not exists phone_country text not null default '+91';

comment on column public.customers.phone_country is 'Selected international dial code for phone';
comment on column public.customers.phone_secondary_country is 'Selected international dial code for phone_secondary';
comment on column public.brokers.phone_country is 'Selected international dial code for phone';
