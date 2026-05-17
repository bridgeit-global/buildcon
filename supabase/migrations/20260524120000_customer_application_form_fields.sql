-- Fields required for printable customer application form (Section A — individual).

alter table public.customers
  add column if not exists guardian_name text,
  add column if not exists residential_status text,
  add column if not exists passport_number text,
  add column if not exists office_name_address text;

comment on column public.customers.guardian_name is 'Father''s / mother''s / spouse''s name';
comment on column public.customers.residential_status is 'e.g. Resident Indian, NRI, Foreign National';
comment on column public.customers.passport_number is 'Passport number when NRI / foreign';
comment on column public.customers.office_name_address is 'Office name and address for application form';
