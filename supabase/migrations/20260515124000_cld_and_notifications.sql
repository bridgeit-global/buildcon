-- Construction-linked demand: stage master + completion log + notification queue (MVP).

create table if not exists public.project_cld_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sort_order int not null default 0,
  name text not null,
  demand_kind text not null default 'percent',
  demand_value numeric not null default 0,
  slab_label text,
  created_at timestamptz not null default now(),
  constraint project_cld_stages_demand_kind_chk check (demand_kind in ('percent', 'fixed')),
  constraint project_cld_stages_project_name_unique unique (project_id, name)
);

create index if not exists project_cld_stages_project_idx
  on public.project_cld_stages (project_id, sort_order);

alter table public.project_cld_stages enable row level security;

create policy "project_cld_stages_select_project"
on public.project_cld_stages
for select
using (public.has_project_access(project_id));

create policy "project_cld_stages_mutate_project"
on public.project_cld_stages
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create table if not exists public.cld_stage_completions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  stage_id uuid not null references public.project_cld_stages (id) on delete cascade,
  completed_on date not null default (current_date),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cld_stage_completions_project_idx
  on public.cld_stage_completions (project_id, completed_on desc);

alter table public.cld_stage_completions enable row level security;

create policy "cld_stage_completions_select_project"
on public.cld_stage_completions
for select
using (public.has_project_access(project_id));

create policy "cld_stage_completions_mutate_project"
on public.cld_stage_completions
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create table if not exists public.cld_notification_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  channel text not null default 'email',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cld_notification_queue_status_chk check (
    status in ('pending', 'sent', 'failed', 'cancelled')
  )
);

create index if not exists cld_notification_queue_pending_idx
  on public.cld_notification_queue (status, scheduled_for)
  where status = 'pending';

alter table public.cld_notification_queue enable row level security;

create policy "cld_notification_queue_select_project"
on public.cld_notification_queue
for select
using (public.has_project_access(project_id));

create policy "cld_notification_queue_mutate_project"
on public.cld_notification_queue
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
