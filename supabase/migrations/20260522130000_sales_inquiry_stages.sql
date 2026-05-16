-- Per-stage rows for each sales inquiry (source of truth for stage payloads).
-- `sales_inquiries.stage_data` is mirrored from these rows for backward compatibility.

create table if not exists public.sales_inquiry_stages (
  id uuid primary key default gen_random_uuid(),
  sales_inquiry_id uuid not null references public.sales_inquiries (id) on delete cascade,
  stage text not null,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_inquiry_stages_stage_chk check (
    stage in (
      'Enquiry',
      'Qualified',
      'Site Visit',
      'Negotiation',
      'Token'
    )
  ),
  constraint sales_inquiry_stages_inquiry_stage_unique unique (sales_inquiry_id, stage)
);

create index if not exists sales_inquiry_stages_inquiry_idx
  on public.sales_inquiry_stages (sales_inquiry_id);

alter table public.sales_inquiry_stages enable row level security;

create policy "sales_inquiry_stages_select_via_inquiry"
on public.sales_inquiry_stages
for select
using (
  exists (
    select 1
    from public.sales_inquiries i
    where i.id = sales_inquiry_stages.sales_inquiry_id
      and public.has_project_access(i.project_id)
  )
);

create policy "sales_inquiry_stages_mutate_via_inquiry"
on public.sales_inquiry_stages
for all
using (
  exists (
    select 1
    from public.sales_inquiries i
    where i.id = sales_inquiry_stages.sales_inquiry_id
      and public.has_project_access(i.project_id)
  )
)
with check (
  exists (
    select 1
    from public.sales_inquiries i
    where i.id = sales_inquiry_stages.sales_inquiry_id
      and public.has_project_access(i.project_id)
  )
);

create or replace function public.trg_sales_inquiry_stages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_inquiry_stages_set_updated_at on public.sales_inquiry_stages;

create trigger sales_inquiry_stages_set_updated_at
before update on public.sales_inquiry_stages
for each row
execute function public.trg_sales_inquiry_stages_set_updated_at();

-- Mirror all stage payloads into sales_inquiries.stage_data (json keys).
create or replace function public.sync_sales_inquiry_stage_data(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merged jsonb;
  v_existing jsonb;
begin
  select stage_data into v_existing
  from public.sales_inquiries
  where id = p_inquiry_id;

  select jsonb_strip_nulls(
    jsonb_build_object(
      'enquiry',
      coalesce(
        (array_agg(s.payload) filter (where s.stage = 'Enquiry'))[1],
        '{}'::jsonb
      ),
      'qualified',
      coalesce(
        (array_agg(s.payload) filter (where s.stage = 'Qualified'))[1],
        '{}'::jsonb
      ),
      'site_visit',
      coalesce(
        (array_agg(s.payload) filter (where s.stage = 'Site Visit'))[1],
        '{}'::jsonb
      ),
      'negotiation',
      coalesce(
        (array_agg(s.payload) filter (where s.stage = 'Negotiation'))[1],
        '{}'::jsonb
      ),
      'token',
      coalesce(
        (array_agg(s.payload) filter (where s.stage = 'Token'))[1],
        '{}'::jsonb
      )
    )
  )
  into v_merged
  from public.sales_inquiry_stages s
  where s.sales_inquiry_id = p_inquiry_id;

  if v_merged is null then
    v_merged := '{}'::jsonb;
  end if;

  if v_existing is not null and (v_existing ? 'closed') then
    v_merged := v_merged || jsonb_build_object('closed', v_existing -> 'closed');
  end if;

  update public.sales_inquiries
  set stage_data = v_merged
  where id = p_inquiry_id;
end;
$$;

create or replace function public.trg_sales_inquiry_stages_sync_stage_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry_id uuid;
begin
  v_inquiry_id := coalesce(new.sales_inquiry_id, old.sales_inquiry_id);
  perform public.sync_sales_inquiry_stage_data(v_inquiry_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists sales_inquiry_stages_sync_stage_data on public.sales_inquiry_stages;

create trigger sales_inquiry_stages_sync_stage_data
after insert or update or delete on public.sales_inquiry_stages
for each row
execute function public.trg_sales_inquiry_stages_sync_stage_data();

-- Seed five stage rows for every new inquiry.
create or replace function public.trg_sales_inquiries_seed_inquiry_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sales_inquiry_stages (sales_inquiry_id, stage) values
    (new.id, 'Enquiry'),
    (new.id, 'Qualified'),
    (new.id, 'Site Visit'),
    (new.id, 'Negotiation'),
    (new.id, 'Token')
  on conflict (sales_inquiry_id, stage) do nothing;
  return new;
end;
$$;

drop trigger if exists sales_inquiries_seed_inquiry_stages on public.sales_inquiries;

create trigger sales_inquiries_seed_inquiry_stages
after insert on public.sales_inquiries
for each row
execute function public.trg_sales_inquiries_seed_inquiry_stages();

-- Backfill stage rows from legacy stage_data JSON on sales_inquiries.
insert into public.sales_inquiry_stages (sales_inquiry_id, stage, payload)
select
  i.id,
  v.stage,
  case v.stage
    when 'Enquiry' then coalesce(i.stage_data -> 'enquiry', '{}'::jsonb)
    when 'Qualified' then coalesce(i.stage_data -> 'qualified', '{}'::jsonb)
    when 'Site Visit' then coalesce(i.stage_data -> 'site_visit', '{}'::jsonb)
    when 'Negotiation' then coalesce(i.stage_data -> 'negotiation', '{}'::jsonb)
    when 'Token' then coalesce(i.stage_data -> 'token', '{}'::jsonb)
  end
from public.sales_inquiries i
cross join (
  values
    ('Enquiry'),
    ('Qualified'),
    ('Site Visit'),
    ('Negotiation'),
    ('Token')
) as v(stage)
on conflict (sales_inquiry_id, stage) do update
set
  payload = excluded.payload,
  updated_at = now();

-- Keep negotiation approval RPC in sync with stage rows.
create or replace function public.decide_negotiation_approval(
  p_approval_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns public.negotiation_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.negotiation_approvals;
  v_status text;
  v_neg_payload jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can decide negotiation approvals';
  end if;

  if lower(coalesce(p_decision, '')) in ('approve', 'approved') then
    v_status := 'Approved';
  elsif lower(coalesce(p_decision, '')) in ('reject', 'rejected') then
    v_status := 'Rejected';
  else
    raise exception 'Decision must be approve or reject (got %)', p_decision;
  end if;

  update public.negotiation_approvals
  set
    status = v_status,
    decision_note = p_decision_note,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_approval_id
    and status = 'Pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Approval not found or already decided';
  end if;

  select coalesce(payload, '{}'::jsonb)
  into v_neg_payload
  from public.sales_inquiry_stages
  where sales_inquiry_id = v_row.sales_inquiry_id
    and stage = 'Negotiation';

  v_neg_payload := v_neg_payload
    || jsonb_build_object(
      'approval_status', lower(v_status),
      'approval_id', v_row.id,
      'offered_price', v_row.offered_price::text,
      'decision_note', coalesce(p_decision_note, ''),
      'decided_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );

  update public.sales_inquiry_stages
  set payload = v_neg_payload
  where sales_inquiry_id = v_row.sales_inquiry_id
    and stage = 'Negotiation';

  return v_row;
end;
$$;

grant execute on function public.sync_sales_inquiry_stage_data(uuid) to authenticated;
grant execute on function public.decide_negotiation_approval(uuid, text, text)
  to authenticated;
