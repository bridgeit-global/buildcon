-- Sales pipeline: one opportunity per inquiry + follow-ups + site visits.

create table if not exists public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sales_inquiry_id uuid not null references public.sales_inquiries (id) on delete cascade,
  funnel_stage text not null default 'Enquiry',
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_opportunities_inquiry_unique unique (sales_inquiry_id),
  constraint sales_opportunities_funnel_stage_chk check (
    funnel_stage in (
      'Enquiry',
      'Qualified',
      'Site Visit',
      'Negotiation',
      'Token',
      'Booking',
      'Won',
      'Lost'
    )
  )
);

create index if not exists sales_opportunities_project_idx
  on public.sales_opportunities (project_id, funnel_stage);

create index if not exists sales_opportunities_assigned_idx
  on public.sales_opportunities (assigned_to)
  where assigned_to is not null;

create table if not exists public.sales_follow_ups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.sales_opportunities (id) on delete cascade,
  due_at timestamptz not null,
  note text,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_follow_ups_opportunity_idx
  on public.sales_follow_ups (opportunity_id, due_at desc);

create table if not exists public.sales_site_visits (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.sales_opportunities (id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'Scheduled',
  outcome text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_site_visits_status_chk check (
    status in ('Scheduled', 'Done', 'No-show', 'Cancelled')
  )
);

create index if not exists sales_site_visits_opportunity_idx
  on public.sales_site_visits (opportunity_id, scheduled_at desc);

alter table public.sales_opportunities enable row level security;
alter table public.sales_follow_ups enable row level security;
alter table public.sales_site_visits enable row level security;

create policy "sales_opportunities_select_project"
on public.sales_opportunities
for select
using (public.has_project_access(project_id));

create policy "sales_opportunities_mutate_project"
on public.sales_opportunities
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create policy "sales_follow_ups_select_via_opportunity"
on public.sales_follow_ups
for select
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_follow_ups.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create policy "sales_follow_ups_mutate_via_opportunity"
on public.sales_follow_ups
for all
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_follow_ups.opportunity_id
      and public.has_project_access(o.project_id)
  )
)
with check (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_follow_ups.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create policy "sales_site_visits_select_via_opportunity"
on public.sales_site_visits
for select
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_site_visits.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create policy "sales_site_visits_mutate_via_opportunity"
on public.sales_site_visits
for all
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_site_visits.opportunity_id
      and public.has_project_access(o.project_id)
  )
)
with check (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_site_visits.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create or replace function public.trg_sales_inquiries_create_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sales_opportunities (
    project_id,
    sales_inquiry_id,
    funnel_stage,
    assigned_to
  )
  values (
    new.project_id,
    new.id,
    'Enquiry',
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists sales_inquiries_create_opportunity on public.sales_inquiries;

create trigger sales_inquiries_create_opportunity
after insert on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_create_opportunity();

insert into public.sales_opportunities (project_id, sales_inquiry_id, funnel_stage, assigned_to)
select
  i.project_id,
  i.id,
  'Enquiry',
  i.created_by
from public.sales_inquiries i
where not exists (
  select 1
  from public.sales_opportunities o
  where o.sales_inquiry_id = i.id
);

create or replace function public.trg_sales_opportunities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_opportunities_set_updated_at on public.sales_opportunities;

create trigger sales_opportunities_set_updated_at
before update on public.sales_opportunities
for each row
execute function public.trg_sales_opportunities_set_updated_at();
