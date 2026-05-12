-- Org-wide broker master list + optional link from sales inquiries.

create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  license_no text,
  status text not null default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  constraint brokers_status_chk check (status in ('Active', 'Inactive'))
);

create index if not exists brokers_status_idx on public.brokers (status);

alter table public.brokers enable row level security;

create policy "brokers_staff_all"
on public.brokers
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

alter table public.sales_inquiries
  add column if not exists broker_id uuid references public.brokers (id) on delete set null;

create index if not exists sales_inquiries_broker_idx
  on public.sales_inquiries (broker_id)
  where broker_id is not null;
