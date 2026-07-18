-- Persist the dial code selected alongside the organization phone number,
-- matching customers/brokers. Existing rows default to India.

alter table public.organization_settings
  add column if not exists phone_country text not null default '+91';

comment on column public.organization_settings.phone_country is 'Selected international dial code for phone';
