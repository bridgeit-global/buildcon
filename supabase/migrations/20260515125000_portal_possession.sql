-- Buyer / channel-partner portal links on profiles + possession tracker + KYC read for linked customers.

alter table public.profiles
  add column if not exists linked_customer_id uuid references public.customers (id) on delete set null;

alter table public.profiles
  add column if not exists linked_broker_id uuid references public.brokers (id) on delete set null;

create index if not exists profiles_linked_customer_idx
  on public.profiles (linked_customer_id)
  where linked_customer_id is not null;

create index if not exists profiles_linked_broker_idx
  on public.profiles (linked_broker_id)
  where linked_broker_id is not null;

create table if not exists public.possession_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  workflow_stage text not null default 'OC',
  snag_list jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  keys_handed_over_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint possession_cases_unit_unique unique (unit_id),
  constraint possession_cases_workflow_chk check (
    workflow_stage in (
      'OC',
      'FinalDemand',
      'PossessionLetter',
      'Handover',
      'Closed'
    )
  )
);

create index if not exists possession_cases_project_idx
  on public.possession_cases (project_id, workflow_stage);

alter table public.possession_cases enable row level security;

create policy "possession_cases_select_project"
on public.possession_cases
for select
using (public.has_project_access(project_id));

create policy "possession_cases_mutate_project"
on public.possession_cases
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "possession_cases_select_own_customer"
on public.possession_cases
for select
using (
  exists (
    select 1
    from public.bookings b
    join public.profiles p on p.id = auth.uid()
    where b.id = possession_cases.booking_id
      and p.linked_customer_id is not null
      and p.linked_customer_id = b.customer_id
  )
);

create policy "bookings_select_own_customer"
on public.bookings
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_customer_id is not null
      and p.linked_customer_id = bookings.customer_id
  )
);

create policy "payment_schedules_select_own_customer"
on public.payment_schedules
for select
using (
  exists (
    select 1
    from public.bookings b
    join public.profiles p on p.id = auth.uid()
    where b.id = payment_schedules.booking_id
      and p.linked_customer_id is not null
      and p.linked_customer_id = b.customer_id
  )
);

create policy "collections_select_own_customer"
on public.collections
for select
using (
  exists (
    select 1
    from public.bookings b
    join public.profiles p on p.id = auth.uid()
    where b.id = collections.booking_id
      and p.linked_customer_id is not null
      and p.linked_customer_id = b.customer_id
  )
);

create policy "units_select_own_booking"
on public.units
for select
using (
  exists (
    select 1
    from public.bookings b
    join public.profiles p on p.id = auth.uid()
    where b.unit_id = units.id
      and p.linked_customer_id is not null
      and p.linked_customer_id = b.customer_id
  )
);

create policy "projects_select_own_booking"
on public.projects
for select
using (
  exists (
    select 1
    from public.bookings b
    join public.profiles p on p.id = auth.uid()
    where b.project_id = projects.id
      and p.linked_customer_id is not null
      and p.linked_customer_id = b.customer_id
  )
);

create policy "sales_inquiries_select_linked_broker"
on public.sales_inquiries
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_broker_id is not null
      and sales_inquiries.broker_id = p.linked_broker_id
  )
);

create policy "customers_select_linked_portal"
on public.customers
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_customer_id is not null
      and p.linked_customer_id = customers.id
  )
);

create policy "customer_kyc_documents_select_linked_portal"
on public.customer_kyc_documents
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_customer_id is not null
      and p.linked_customer_id = customer_kyc_documents.customer_id
  )
);

create policy "kyc_objects_select_linked_customer"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'kyc'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_customer_id is not null
      and split_part(name, '/', 2) = p.linked_customer_id::text
  )
);
