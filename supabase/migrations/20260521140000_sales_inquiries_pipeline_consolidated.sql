-- Pipeline lives on sales_inquiries; drop sales_opportunities and child tables.

alter table public.sales_inquiries
  add column if not exists funnel_stage text not null default 'Enquiry',
  add column if not exists assigned_to uuid references auth.users (id) on delete set null,
  add column if not exists stage_data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.sales_inquiries
  drop constraint if exists sales_inquiries_funnel_stage_chk;

alter table public.sales_inquiries
  add constraint sales_inquiries_funnel_stage_chk check (
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
  );

create index if not exists sales_inquiries_project_stage_idx
  on public.sales_inquiries (project_id, funnel_stage);

create index if not exists sales_inquiries_assigned_idx
  on public.sales_inquiries (assigned_to)
  where assigned_to is not null;

-- Copy funnel + assignee from legacy opportunities.
update public.sales_inquiries i
set
  funnel_stage = o.funnel_stage,
  assigned_to = o.assigned_to,
  updated_at = coalesce(o.updated_at, i.created_at)
from public.sales_opportunities o
where o.sales_inquiry_id = i.id;

-- Merge per-stage payloads into stage_data JSON (one row per stage per opportunity).
update public.sales_inquiries i
set stage_data = sub.merged
from (
  select
    o.sales_inquiry_id as inquiry_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'enquiry',
        coalesce(
          (array_agg(ps.payload) filter (where ps.stage = 'Enquiry'))[1],
          '{}'::jsonb
        ),
        'qualified',
        coalesce(
          (array_agg(ps.payload) filter (where ps.stage = 'Qualified'))[1],
          '{}'::jsonb
        ),
        'site_visit',
        coalesce(
          (array_agg(ps.payload) filter (where ps.stage = 'Site Visit'))[1],
          '{}'::jsonb
        ),
        'negotiation',
        coalesce(
          (array_agg(ps.payload) filter (where ps.stage = 'Negotiation'))[1],
          '{}'::jsonb
        ),
        'token',
        coalesce(
          (array_agg(ps.payload) filter (where ps.stage = 'Token'))[1],
          '{}'::jsonb
        )
      )
    ) as merged
  from public.sales_opportunities o
  left join public.sales_pipeline_stages ps on ps.opportunity_id = o.id
  group by o.sales_inquiry_id
) sub
where i.id = sub.inquiry_id;

-- Align open enquiries with a unit to Qualified (matches prior insert trigger).
update public.sales_inquiries
set funnel_stage = 'Qualified'
where unit_id is not null
  and funnel_stage = 'Enquiry';

-- Drop legacy inquiry → opportunity automation.
drop trigger if exists sales_inquiries_create_opportunity on public.sales_inquiries;
drop trigger if exists sales_opportunities_sync_unit_on_funnel on public.sales_opportunities;
drop trigger if exists sales_opportunities_seed_pipeline_stages on public.sales_opportunities;
drop trigger if exists sales_opportunities_set_updated_at on public.sales_opportunities;
drop trigger if exists sales_pipeline_stages_set_updated_at on public.sales_pipeline_stages;

drop function if exists public.trg_sales_inquiries_create_opportunity();
drop function if exists public.trg_sales_opportunities_sync_unit_on_funnel();
drop function if exists public.trg_sales_opportunities_seed_pipeline_stages();
drop function if exists public.trg_sales_opportunities_set_updated_at();
drop function if exists public.trg_sales_pipeline_stages_set_updated_at();

-- New inquiry with unit starts Qualified; block unit when still available.
create or replace function public.trg_sales_inquiries_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.unit_id is not null then
    new.funnel_stage := 'Qualified';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_inquiries_before_insert on public.sales_inquiries;

create trigger sales_inquiries_before_insert
before insert on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_before_insert();

create or replace function public.trg_sales_inquiries_after_insert_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status text;
begin
  if new.unit_id is null then
    return new;
  end if;

  select public.unit_status_for_funnel_stage(new.funnel_stage, u.status)
  into v_next_status
  from public.units u
  where u.id = new.unit_id;

  if v_next_status is not null then
    update public.units
    set status = v_next_status
    where id = new.unit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sales_inquiries_after_insert_unit on public.sales_inquiries;

create trigger sales_inquiries_after_insert_unit
after insert on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_after_insert_unit();

-- Sync inventory when funnel_stage changes on the inquiry row.
create or replace function public.trg_sales_inquiries_sync_unit_on_funnel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status text;
begin
  if old.funnel_stage is not distinct from new.funnel_stage then
    return new;
  end if;

  if new.unit_id is null then
    return new;
  end if;

  select public.unit_status_for_funnel_stage(new.funnel_stage, u.status)
  into v_next_status
  from public.units u
  where u.id = new.unit_id;

  if v_next_status is not null then
    update public.units
    set status = v_next_status
    where id = new.unit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sales_inquiries_sync_unit_on_funnel on public.sales_inquiries;

create trigger sales_inquiries_sync_unit_on_funnel
after update of funnel_stage on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_sync_unit_on_funnel();

create or replace function public.trg_sales_inquiries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_inquiries_set_updated_at on public.sales_inquiries;

create trigger sales_inquiries_set_updated_at
before update on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_set_updated_at();

-- Remove legacy pipeline tables (order: children first).
drop table if exists public.sales_follow_ups cascade;
drop table if exists public.sales_site_visits cascade;
drop table if exists public.sales_pipeline_stages cascade;
drop table if exists public.sales_opportunities cascade;
