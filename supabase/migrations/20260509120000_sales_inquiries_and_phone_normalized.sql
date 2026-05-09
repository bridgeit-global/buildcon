-- Normalized phone on customers for inquiry dedup / lookup (derived from phone).
alter table public.customers
  add column if not exists phone_normalized text
  generated always as (
    nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
  ) stored;

create index if not exists customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

-- Sales inquiries (per project; links customer + interested unit).
create table if not exists public.sales_inquiries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete restrict,
  lead_source text not null default 'Direct',
  interested_in text,
  parking_required text not null default 'No',
  parking_count text not null default '1',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_inquiries_parking_required_chk
    check (parking_required in ('Yes', 'No'))
);

create index if not exists sales_inquiries_project_created_idx
  on public.sales_inquiries (project_id, created_at desc);

create index if not exists sales_inquiries_customer_idx
  on public.sales_inquiries (customer_id);

alter table public.sales_inquiries enable row level security;

create policy "sales_inquiries_select_project"
on public.sales_inquiries
for select
using (public.has_project_access(project_id));

create policy "sales_inquiries_mutate_project"
on public.sales_inquiries
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
