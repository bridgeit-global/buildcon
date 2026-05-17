-- Booking workflow: Token → Application → Allotment → Confirmation
-- Cancellation + refund tracking; customer PAN / Aadhaar last-4

alter table public.bookings
  add column if not exists workflow_stage text not null default 'token',
  add column if not exists stage_data jsonb not null default '{}'::jsonb,
  add column if not exists sales_inquiry_id uuid references public.sales_inquiries (id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookings
  drop constraint if exists bookings_workflow_stage_check;

alter table public.bookings
  add constraint bookings_workflow_stage_check
  check (workflow_stage in ('token', 'application', 'allotment', 'confirmation'));

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('active', 'cancelled'));

-- Existing one-shot bookings → confirmed workflow
update public.bookings
set
  workflow_stage = 'confirmation',
  updated_at = now()
where workflow_stage = 'token'
  and stage = 'booking'
  and status = 'active';

create index if not exists bookings_workflow_stage_idx
  on public.bookings (project_id, workflow_stage);

create index if not exists bookings_sales_inquiry_id_idx
  on public.bookings (sales_inquiry_id)
  where sales_inquiry_id is not null;

alter table public.customers
  add column if not exists pan_number text,
  add column if not exists aadhaar_last4 text;

create table if not exists public.booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  reason text not null,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz not null default now(),
  notes text,
  unique (booking_id)
);

create table if not exists public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cancellation_id uuid references public.booking_cancellations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  total_collected numeric not null default 0,
  deduction_pct numeric not null default 10,
  deduction_amount numeric not null default 0,
  refund_amount numeric not null default 0,
  policy_notes text,
  status text not null default 'calculated',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.booking_cancellations enable row level security;
alter table public.booking_refunds enable row level security;

create policy "booking_cancellations_select_project"
on public.booking_cancellations
for select
using (public.has_project_access(project_id));

create policy "booking_cancellations_mutate_project"
on public.booking_cancellations
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "booking_refunds_select_project"
on public.booking_refunds
for select
using (public.has_project_access(project_id));

create policy "booking_refunds_mutate_project"
on public.booking_refunds
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
