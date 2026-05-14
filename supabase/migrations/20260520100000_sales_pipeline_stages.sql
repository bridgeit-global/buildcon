-- One row per pipeline stage per opportunity (replaces JSON stage_data on sales_opportunities).

create table if not exists public.sales_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.sales_opportunities (id) on delete cascade,
  stage text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_pipeline_stages_stage_chk check (
    stage in (
      'Enquiry',
      'Qualified',
      'Site Visit',
      'Negotiation',
      'Token'
    )
  ),
  constraint sales_pipeline_stages_opportunity_stage_unique unique (opportunity_id, stage)
);

create index if not exists sales_pipeline_stages_opportunity_idx
  on public.sales_pipeline_stages (opportunity_id);

alter table public.sales_pipeline_stages enable row level security;

create policy "sales_pipeline_stages_select_via_opportunity"
on public.sales_pipeline_stages
for select
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_pipeline_stages.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create policy "sales_pipeline_stages_mutate_via_opportunity"
on public.sales_pipeline_stages
for all
using (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_pipeline_stages.opportunity_id
      and public.has_project_access(o.project_id)
  )
)
with check (
  exists (
    select 1
    from public.sales_opportunities o
    where o.id = sales_pipeline_stages.opportunity_id
      and public.has_project_access(o.project_id)
  )
);

create or replace function public.trg_sales_pipeline_stages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_pipeline_stages_set_updated_at on public.sales_pipeline_stages;

create trigger sales_pipeline_stages_set_updated_at
before update on public.sales_pipeline_stages
for each row
execute function public.trg_sales_pipeline_stages_set_updated_at();

-- Seed five rows for every new opportunity.
create or replace function public.trg_sales_opportunities_seed_pipeline_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sales_pipeline_stages (opportunity_id, stage) values
    (new.id, 'Enquiry'),
    (new.id, 'Qualified'),
    (new.id, 'Site Visit'),
    (new.id, 'Negotiation'),
    (new.id, 'Token')
  on conflict (opportunity_id, stage) do nothing;
  return new;
end;
$$;

drop trigger if exists sales_opportunities_seed_pipeline_stages on public.sales_opportunities;

create trigger sales_opportunities_seed_pipeline_stages
after insert on public.sales_opportunities
for each row
execute function public.trg_sales_opportunities_seed_pipeline_stages();

-- Backfill from legacy stage_data JSON (one blob per opportunity).
insert into public.sales_pipeline_stages (opportunity_id, stage, payload)
select
  o.id,
  v.stage,
  case v.stage
    when 'Enquiry' then coalesce(o.stage_data -> 'enquiry', '{}'::jsonb)
    when 'Qualified' then coalesce(o.stage_data -> 'qualified', '{}'::jsonb)
    when 'Site Visit' then coalesce(o.stage_data -> 'site_visit', '{}'::jsonb)
    when 'Negotiation' then coalesce(o.stage_data -> 'negotiation', '{}'::jsonb)
    when 'Token' then coalesce(o.stage_data -> 'token', '{}'::jsonb)
  end
from public.sales_opportunities o
cross join (
  values
    ('Enquiry'),
    ('Qualified'),
    ('Site Visit'),
    ('Negotiation'),
    ('Token')
) as v(stage)
on conflict (opportunity_id, stage) do update
set
  payload = excluded.payload,
  updated_at = now();

alter table public.sales_opportunities
  drop column if exists stage_data;
