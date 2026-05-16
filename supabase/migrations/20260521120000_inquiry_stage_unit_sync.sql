-- Inquiry pipeline: qualify on create (unit selected), sync unit status on funnel_stage change.

create or replace function public.unit_status_for_funnel_stage(
  p_funnel_stage text,
  p_current_status text
)
returns text
language plpgsql
immutable
as $$
declare
  fs text := trim(coalesce(p_funnel_stage, ''));
  s text := upper(trim(coalesce(p_current_status, '')));
begin
  if fs = 'Qualified' then
    if s in ('AVAILABLE', 'A') then
      return 'BLOCKED';
    end if;
    return null;
  end if;

  if fs = 'Token' then
    if s in ('AVAILABLE', 'A', 'BLOCKED', 'BL') then
      return 'TOKEN';
    end if;
    return null;
  end if;

  if fs in ('Booking', 'Won') then
    if s in ('AVAILABLE', 'A', 'BLOCKED', 'BL', 'TOKEN') then
      return 'BOOKED';
    end if;
    return null;
  end if;

  if fs = 'Lost' then
    if s in ('TOKEN', 'BLOCKED', 'BL') then
      return 'AVAILABLE';
    end if;
    return null;
  end if;

  return null;
end;
$$;

-- New inquiry with a unit → opportunity starts Qualified; block unit when available.
create or replace function public.trg_sales_inquiries_create_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_id uuid;
  v_next_status text;
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
    'Qualified',
    new.created_by
  )
  returning id into v_opp_id;

  if new.unit_id is not null then
    select public.unit_status_for_funnel_stage('Qualified', u.status)
    into v_next_status
    from public.units u
    where u.id = new.unit_id;

    if v_next_status is not null then
      update public.units
      set status = v_next_status
      where id = new.unit_id;
    end if;
  end if;

  return new;
end;
$$;

-- Keep inventory aligned when funnel_stage is updated (UI, API, or manual SQL).
create or replace function public.trg_sales_opportunities_sync_unit_on_funnel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_next_status text;
begin
  if old.funnel_stage is not distinct from new.funnel_stage then
    return new;
  end if;

  select i.unit_id
  into v_unit_id
  from public.sales_inquiries i
  where i.id = new.sales_inquiry_id;

  if v_unit_id is null then
    return new;
  end if;

  select public.unit_status_for_funnel_stage(new.funnel_stage, u.status)
  into v_next_status
  from public.units u
  where u.id = v_unit_id;

  if v_next_status is not null then
    update public.units
    set status = v_next_status
    where id = v_unit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sales_opportunities_sync_unit_on_funnel on public.sales_opportunities;

create trigger sales_opportunities_sync_unit_on_funnel
after update of funnel_stage on public.sales_opportunities
for each row
execute function public.trg_sales_opportunities_sync_unit_on_funnel();

-- Site visit status: allow Rescheduled (already used in UI).
alter table public.sales_site_visits
  drop constraint if exists sales_site_visits_status_chk;

alter table public.sales_site_visits
  add constraint sales_site_visits_status_chk check (
    status in ('Scheduled', 'Done', 'No-show', 'Cancelled', 'Rescheduled')
  );

-- Existing open enquiries with a unit: align funnel to Qualified.
update public.sales_opportunities o
set funnel_stage = 'Qualified'
from public.sales_inquiries i
where o.sales_inquiry_id = i.id
  and o.funnel_stage = 'Enquiry'
  and i.unit_id is not null;

update public.units u
set status = 'BLOCKED'
from public.sales_inquiries i
join public.sales_opportunities o on o.sales_inquiry_id = i.id
where u.id = i.unit_id
  and o.funnel_stage = 'Qualified'
  and upper(trim(coalesce(u.status, ''))) in ('AVAILABLE', 'A');
