-- Project pricing profile + quotation records (pre-booking).

alter table public.projects
  add column if not exists pricing_gst_registered boolean not null default false;

alter table public.projects
  add column if not exists pricing_gst_percent numeric not null default 0;

alter table public.projects
  add column if not exists pricing_stamp_duty_percent numeric not null default 0;

alter table public.projects
  add column if not exists pricing_registration_fee numeric not null default 0;

comment on column public.projects.pricing_gst_registered is 'When true, GST line applies on quotations/cost sheets.';
comment on column public.projects.pricing_stamp_duty_percent is 'Estimated stamp duty as % of agreement value (Mumbai rules vary; editable).';
comment on column public.projects.pricing_registration_fee is 'Flat registration estimate (INR).';

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  sales_inquiry_id uuid references public.sales_inquiries (id) on delete set null,
  status text not null default 'draft',
  agreement_value_basic numeric not null default 0,
  parking_amount numeric not null default 0,
  gst_amount numeric not null default 0,
  stamp_duty_estimate numeric not null default 0,
  registration_estimate numeric not null default 0,
  discount_amount numeric not null default 0,
  grand_total numeric not null default 0,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotations_status_chk check (
    status in ('draft', 'sent', 'accepted', 'expired', 'rejected')
  )
);

create index if not exists quotations_project_idx
  on public.quotations (project_id, created_at desc);

alter table public.quotations enable row level security;

create policy "quotations_select_project"
on public.quotations
for select
using (public.has_project_access(project_id));

create policy "quotations_mutate_project"
on public.quotations
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create or replace function public.trg_quotations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quotations_set_updated_at on public.quotations;

create trigger quotations_set_updated_at
before update on public.quotations
for each row
execute function public.trg_quotations_set_updated_at();
