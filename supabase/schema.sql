-- BuildCon CRM schema (MVP)
-- Apply in Supabase SQL editor (or via migrations) in the target project.
--
-- Notes:
-- - RLS is enabled on all tables in `public`.
-- - Authorization is project-scoped via `project_members`.
-- - Do NOT use user-editable metadata for authorization decisions.

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null default 'CRM Executive',
  created_at timestamptz not null default now()
);

-- Ensure every auth user has a corresponding profile row.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

alter table public.profiles enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
using (auth.uid() = id);

-- Allow staff to list users for assignment UI
create policy "profiles_select_authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Projects + membership
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  type text not null default 'Redevelopment', -- Redevelopment | Greenfield | Mixed Use
  status text not null default 'Active',       -- Active | Planning | On Hold
  fy text,
  rera_no text,
  floors_per_wing int not null default 1,
  units_per_floor int not null default 1,
  base_rate int,
  min_rate int,
  max_rate int,
  parking_slots int,
  parking_rate int,
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'Member',   -- Member | Manager (app-level meaning)
  status text not null default 'Active', -- Active | Inactive
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Helpers (must be after tables they reference)
-- -----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Super Admin'
  );
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'Active'
  );
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

create policy "projects_select_members"
on public.projects
for select
using (public.has_project_access(id));

create policy "projects_insert_super_admin"
on public.projects
for insert
with check (public.is_super_admin());

create policy "projects_update_super_admin"
on public.projects
for update
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "project_members_select_project"
on public.project_members
for select
using (public.has_project_access(project_id));

create policy "project_members_mutate_super_admin"
on public.project_members
for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- Inventory
-- -----------------------------------------------------------------------------

create table if not exists public.project_wings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.project_unit_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  wing_name text not null,
  floor int not null,
  unit_no int not null,
  unit_code text not null, -- e.g. A-1032 or T1-1201
  unit_type text,
  area numeric,
  carpet_area numeric,
  bua_area numeric,
  rera_area numeric,
  terrace_sqft numeric,
  deck_sqft numeric,
  loading_sqft numeric,
  floor_rise_charge integer not null default 0,
  plc_charge integer not null default 0,
  parking_slots_included smallint not null default 0,
  rate int,
  status text not null default 'A', -- A|B|S|RR|BL (prototype)
  blocked_reason text,
  blocked_by uuid references auth.users (id),
  blocked_on date,
  rehab_member_id uuid,
  created_at timestamptz not null default now(),
  unique (project_id, unit_code)
);

alter table public.project_wings enable row level security;
alter table public.project_unit_types enable row level security;
alter table public.units enable row level security;

create policy "wings_select_project"
on public.project_wings
for select
using (public.has_project_access(project_id));

create policy "wings_mutate_super_admin"
on public.project_wings
for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "unit_types_select_project"
on public.project_unit_types
for select
using (public.has_project_access(project_id));

create policy "unit_types_mutate_super_admin"
on public.project_unit_types
for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "units_select_project"
on public.units
for select
using (public.has_project_access(project_id));

create policy "units_mutate_project_members"
on public.units
for insert
with check (public.has_project_access(project_id));

create policy "units_update_project_members"
on public.units
for update
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

-- -----------------------------------------------------------------------------
-- Customers (org-wide, not per-project)
-- -----------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  dob date,
  occupation text,
  nationality text,
  created_at timestamptz not null default now(),
  phone_normalized text generated always as (
    nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
  ) stored
);

create index if not exists customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  kind text not null default 'current', -- current | permanent
  address_line1 text,
  city text,
  state text,
  pin text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_nominees (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  nominee_name text,
  relationship text,
  nominee_dob date,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_bank_details (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  bank_name text,
  account_no text,
  ifsc text,
  branch text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  doc_type text not null, -- aadhaar|pan|photo|address_proof|etc
  storage_path text not null,
  verified_status text not null default 'Pending', -- Pending|Verified|Rejected
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_nominees enable row level security;
alter table public.customer_bank_details enable row level security;
alter table public.customer_kyc_documents enable row level security;

-- For MVP: customers are readable/writable by any authenticated staff user.
create policy "customers_staff_all"
on public.customers
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "customer_addresses_staff_all"
on public.customer_addresses
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "customer_nominees_staff_all"
on public.customer_nominees
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "customer_bank_details_staff_all"
on public.customer_bank_details
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "customer_kyc_documents_staff_all"
on public.customer_kyc_documents
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- Brokers (org-wide master list)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Bookings + financials
-- -----------------------------------------------------------------------------

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  unit_id uuid not null references public.units (id),
  customer_id uuid not null references public.customers (id),
  stage text not null default 'booking', -- inquiry|booking|allotment|agreement|possession
  payment_mode text,
  loan_bank text,
  booking_amount numeric,
  co_buyers jsonb not null default '[]'::jsonb,
  payment_detail jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  instalment_no int not null,
  milestone text not null,
  due_date date,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (booking_id, instalment_no)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  schedule_id uuid references public.payment_schedules (id) on delete set null,
  received_amount numeric not null default 0,
  received_at date,
  mode text,
  reference text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;
alter table public.payment_schedules enable row level security;
alter table public.collections enable row level security;

create policy "bookings_select_project"
on public.bookings
for select
using (public.has_project_access(project_id));

create policy "bookings_mutate_project"
on public.bookings
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "payment_schedules_select_via_booking"
on public.payment_schedules
for select
using (
  exists (
    select 1
    from public.bookings b
    where b.id = payment_schedules.booking_id
      and public.has_project_access(b.project_id)
  )
);

create policy "payment_schedules_mutate_via_booking"
on public.payment_schedules
for all
using (
  exists (
    select 1
    from public.bookings b
    where b.id = payment_schedules.booking_id
      and public.has_project_access(b.project_id)
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = payment_schedules.booking_id
      and public.has_project_access(b.project_id)
  )
);

create policy "collections_select_via_booking"
on public.collections
for select
using (
  exists (
    select 1
    from public.bookings b
    where b.id = collections.booking_id
      and public.has_project_access(b.project_id)
  )
);

create policy "collections_mutate_via_booking"
on public.collections
for all
using (
  exists (
    select 1
    from public.bookings b
    where b.id = collections.booking_id
      and public.has_project_access(b.project_id)
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = collections.booking_id
      and public.has_project_access(b.project_id)
  )
);

-- -----------------------------------------------------------------------------
-- Sales inquiries (leads; customer + unit interest per project)
-- -----------------------------------------------------------------------------

create table if not exists public.sales_inquiries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete restrict,
  lead_source text not null default 'Direct',
  broker_id uuid references public.brokers (id) on delete set null,
  interested_in text,
  parking_required text not null default 'No',
  parking_count text not null default '1',
  parking_slots_available int,
  parking_rate_snapshot int,
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

create index if not exists sales_inquiries_broker_idx
  on public.sales_inquiries (broker_id)
  where broker_id is not null;

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

-- -----------------------------------------------------------------------------
-- Rehab
-- -----------------------------------------------------------------------------

create table if not exists public.rehab_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  old_unit text,
  old_area numeric,
  carpet_area numeric,
  floor_pref text,
  status text not null default 'Eligible',
  created_at timestamptz not null default now()
);

create table if not exists public.rehab_rent_entries (
  id uuid primary key default gen_random_uuid(),
  rehab_member_id uuid not null references public.rehab_members (id) on delete cascade,
  month text not null,
  amount numeric not null default 0,
  status text not null default 'Paid',
  cheque_no text,
  created_at timestamptz not null default now()
);

alter table public.rehab_members enable row level security;
alter table public.rehab_rent_entries enable row level security;

create policy "rehab_members_select_project"
on public.rehab_members
for select
using (public.has_project_access(project_id));

create policy "rehab_members_mutate_project"
on public.rehab_members
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "rehab_rent_entries_select_via_member"
on public.rehab_rent_entries
for select
using (
  exists (
    select 1
    from public.rehab_members rm
    where rm.id = rehab_rent_entries.rehab_member_id
      and public.has_project_access(rm.project_id)
  )
);

create policy "rehab_rent_entries_mutate_via_member"
on public.rehab_rent_entries
for all
using (
  exists (
    select 1
    from public.rehab_members rm
    where rm.id = rehab_rent_entries.rehab_member_id
      and public.has_project_access(rm.project_id)
  )
)
with check (
  exists (
    select 1
    from public.rehab_members rm
    where rm.id = rehab_rent_entries.rehab_member_id
      and public.has_project_access(rm.project_id)
  )
);

-- -----------------------------------------------------------------------------
-- Loans
-- -----------------------------------------------------------------------------

create table if not exists public.loan_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  customer_id uuid not null references public.customers (id),
  bank text,
  amount numeric,
  status text not null default 'Application',
  applied_at date,
  updated_at timestamptz not null default now()
);

alter table public.loan_cases enable row level security;

create policy "loan_cases_select_project"
on public.loan_cases
for select
using (public.has_project_access(project_id));

create policy "loan_cases_mutate_project"
on public.loan_cases
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

-- -----------------------------------------------------------------------------
-- Documents (templates + generated docs + signatures)
-- -----------------------------------------------------------------------------

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  category text not null default 'Sales',
  body text,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  template_id uuid references public.document_templates (id) on delete set null,
  generated_by uuid references auth.users (id),
  storage_path text not null,
  generated_at timestamptz not null default now()
);

create table if not exists public.project_signatures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  storage_path text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.document_templates enable row level security;
alter table public.generated_documents enable row level security;
alter table public.project_signatures enable row level security;

create policy "document_templates_select_project"
on public.document_templates
for select
using (public.has_project_access(project_id));

create policy "document_templates_mutate_project"
on public.document_templates
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "generated_documents_select_project"
on public.generated_documents
for select
using (public.has_project_access(project_id));

create policy "generated_documents_mutate_project"
on public.generated_documents
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "project_signatures_select_project"
on public.project_signatures
for select
using (public.has_project_access(project_id));

create policy "project_signatures_mutate_project"
on public.project_signatures
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

