-- DB-driven CLD schedule sync: job queue + primitives.
-- Scope: only projects.type in ('Development','Redevelopment').

create table if not exists public.cld_schedule_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reason text not null default 'stage_change',
  status text not null default 'queued',
  attempts int not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cld_schedule_sync_jobs_status_chk
    check (status in ('queued', 'processing', 'done', 'failed', 'cancelled'))
);

create index if not exists cld_schedule_sync_jobs_pick_idx
  on public.cld_schedule_sync_jobs (status, scheduled_for, created_at);

create index if not exists cld_schedule_sync_jobs_project_idx
  on public.cld_schedule_sync_jobs (project_id, status, scheduled_for);

alter table public.cld_schedule_sync_jobs enable row level security;

create policy "cld_schedule_sync_jobs_select_project"
on public.cld_schedule_sync_jobs
for select
using (public.has_project_access(project_id));

create policy "cld_schedule_sync_jobs_mutate_project"
on public.cld_schedule_sync_jobs
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create or replace function public.cld_schedule_sync_jobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cld_schedule_sync_jobs_touch_updated_at on public.cld_schedule_sync_jobs;
create trigger cld_schedule_sync_jobs_touch_updated_at
before update on public.cld_schedule_sync_jobs
for each row execute function public.cld_schedule_sync_jobs_touch_updated_at();

-- Stored booking total used by DB schedule engine.
alter table public.bookings
  add column if not exists sale_total_inr numeric not null default 0;

comment on column public.bookings.sale_total_inr is
  'Final unit sale total in INR (incl. GST/parking when applicable). Used by DB-driven CLD payment schedule generation.';

-- Helper: is this project eligible for CLD automation?
create or replace function public.is_cld_eligible_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.type in ('Development', 'Redevelopment')
  );
$$;

revoke all on function public.is_cld_eligible_project(uuid) from public;
grant execute on function public.is_cld_eligible_project(uuid) to authenticated;

-- Enqueue a schedule sync job (idempotent-ish via status check).
create or replace function public.enqueue_cld_schedule_sync(
  p_project_id uuid,
  p_reason text default 'stage_change',
  p_scheduled_for timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_job_id uuid;
begin
  if p_project_id is null then
    return null;
  end if;

  if not public.is_cld_eligible_project(p_project_id) then
    return null;
  end if;

  -- If a job is already queued/processing, just bump scheduled_for on the newest queued one.
  select j.id
  into v_job_id
  from public.cld_schedule_sync_jobs j
  where j.project_id = p_project_id
    and j.status in ('queued', 'processing')
  order by
    case when j.status = 'queued' then 0 else 1 end,
    j.created_at desc
  limit 1;

  if v_job_id is not null then
    update public.cld_schedule_sync_jobs
    set
      scheduled_for = least(scheduled_for, p_scheduled_for),
      reason = coalesce(nullif(btrim(p_reason), ''), reason),
      status = case when status = 'processing' then status else 'queued' end
    where id = v_job_id;
    return v_job_id;
  end if;

  insert into public.cld_schedule_sync_jobs (project_id, reason, status, scheduled_for)
  values (
    p_project_id,
    coalesce(nullif(btrim(p_reason), ''), 'stage_change'),
    'queued',
    p_scheduled_for
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_cld_schedule_sync(uuid, text, timestamptz) from public;
grant execute on function public.enqueue_cld_schedule_sync(uuid, text, timestamptz) to authenticated;

-- Trigger on CLD stages to enqueue schedule sync.
create or replace function public.trg_project_cld_stages_enqueue_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_project_id := new.project_id;
    v_reason := 'stage_insert';
  elsif tg_op = 'UPDATE' then
    v_project_id := new.project_id;
    v_reason := 'stage_update';
  elsif tg_op = 'DELETE' then
    v_project_id := old.project_id;
    v_reason := 'stage_delete';
  else
    return null;
  end if;

  perform public.enqueue_cld_schedule_sync(v_project_id, v_reason, now());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists project_cld_stages_enqueue_sync on public.project_cld_stages;
create trigger project_cld_stages_enqueue_sync
after insert or update or delete on public.project_cld_stages
for each row execute function public.trg_project_cld_stages_enqueue_sync();

-- -----------------------------------------------------------------------------
-- Payment schedule rebuild (DB-owned)
-- -----------------------------------------------------------------------------

create or replace function public.cld_milestone_label(p_name text, p_slab_label text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(nullif(btrim(p_slab_label), ''), '') <> '' then btrim(p_name) || ' (' || btrim(p_slab_label) || ')'
    else btrim(p_name)
  end;
$$;

revoke all on function public.cld_milestone_label(text, text) from public;
grant execute on function public.cld_milestone_label(text, text) to authenticated;

create or replace function public.rebuild_payment_schedule_for_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
  v_status text;
  v_booking_amount numeric;
  v_sale_total numeric;
  v_target numeric;
  v_stage_count int;
  v_sum numeric := 0;
  v_delta numeric := 0;
  v_result jsonb := '{}'::jsonb;
  r record;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_id_required');
  end if;

  select b.project_id, b.status, coalesce(b.booking_amount, 0), coalesce(b.sale_total_inr, 0)
  into v_project_id, v_status, v_booking_amount, v_sale_total
  from public.bookings b
  where b.id = p_booking_id;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if v_status = 'cancelled' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'booking_cancelled');
  end if;

  if not public.is_cld_eligible_project(v_project_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'project_not_eligible');
  end if;

  v_booking_amount := greatest(0, round(v_booking_amount));
  v_sale_total := greatest(0, round(v_sale_total));
  v_target := greatest(v_sale_total, v_booking_amount);

  create temporary table if not exists tmp_target_schedules (
    booking_id uuid,
    instalment_no int,
    milestone text,
    due_date date,
    amount numeric
  ) on commit drop;
  truncate table tmp_target_schedules;

  select count(*) into v_stage_count
  from public.project_cld_stages s
  where s.project_id = v_project_id;

  if v_stage_count <= 0 then
    -- Fallback: Booking Amount + Pending Amount.
    insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
    values (p_booking_id, 1, 'Booking Amount', current_date, case when v_booking_amount > 0 then v_booking_amount else v_target end);

    if v_target - (case when v_booking_amount > 0 then v_booking_amount else v_target end) > 0 then
      insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
      values (p_booking_id, 2, 'Pending Amount', current_date + 30, v_target - (case when v_booking_amount > 0 then v_booking_amount else v_target end));
    end if;
  else
    -- Stage-driven schedule rows.
    insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
    select
      p_booking_id as booking_id,
      (row_number() over (order by s.sort_order, s.created_at))::int as instalment_no,
      case
        when (row_number() over (order by s.sort_order, s.created_at)) = 1 and v_booking_amount > 0
          then 'Booking Amount'
        else public.cld_milestone_label(s.name, s.slab_label)
      end as milestone,
      (current_date + ((row_number() over (order by s.sort_order, s.created_at) - 1) * 30))::date as due_date,
      case
        when (row_number() over (order by s.sort_order, s.created_at)) = 1 and v_booking_amount > 0
          then v_booking_amount
        when s.demand_kind = 'fixed'
          then greatest(0, round(coalesce(s.demand_value, 0)))
        else greatest(0, round((v_target * (coalesce(s.demand_value, 0))) / 100))
      end as amount
    from public.project_cld_stages s
    where s.project_id = v_project_id;

    -- Balance last instalment to hit v_target exactly (simple, deterministic).
    select coalesce(sum(t.amount), 0) into v_sum from tmp_target_schedules t;
    v_delta := v_target - v_sum;
    if v_delta <> 0 then
      update tmp_target_schedules
      set amount = greatest(0, round(amount + v_delta))
      where instalment_no = (select max(instalment_no) from tmp_target_schedules);
    end if;
  end if;

  -- Preserve collections: never set amount below received; never delete rows that have collections.
  for r in
    select
      ps.id as schedule_id,
      ps.instalment_no,
      ps.amount as scheduled_amount,
      ps.due_date as existing_due_date,
      coalesce((
        select sum(c.received_amount)
        from public.collections c
        where c.schedule_id = ps.id
      ), 0) as received_amount
    from public.payment_schedules ps
    where ps.booking_id = p_booking_id
  loop
    update tmp_target_schedules t
    set
      amount = greatest(t.amount, round(r.received_amount)),
      due_date = coalesce(r.existing_due_date, t.due_date)
    where t.instalment_no = r.instalment_no;
  end loop;

  -- Upsert target rows.
  for r in
    select booking_id, instalment_no, milestone, due_date, amount
    from tmp_target_schedules
    order by instalment_no
  loop
    insert into public.payment_schedules (booking_id, instalment_no, milestone, due_date, amount)
    values (r.booking_id, r.instalment_no, r.milestone, r.due_date, round(r.amount))
    on conflict (booking_id, instalment_no) do update
    set
      milestone = excluded.milestone,
      due_date = excluded.due_date,
      amount = excluded.amount;
  end loop;

  -- Handle extra existing schedule rows not in target.
  for r in
    select
      ps.id as schedule_id,
      ps.instalment_no,
      ps.milestone,
      ps.amount,
      coalesce((
        select sum(c.received_amount)
        from public.collections c
        where c.schedule_id = ps.id
      ), 0) as received_amount
    from public.payment_schedules ps
    where ps.booking_id = p_booking_id
      and not exists (
        select 1 from tmp_target_schedules t
        where t.instalment_no = ps.instalment_no
      )
  loop
    if round(r.received_amount) > 0 then
      update public.payment_schedules
      set
        amount = greatest(round(amount), round(r.received_amount)),
        milestone = case
          when position('(closed)' in milestone) > 0 then milestone
          else milestone || ' (closed)'
        end
      where id = r.schedule_id;
    else
      delete from public.payment_schedules where id = r.schedule_id;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'project_id', v_project_id,
    'target_total', v_target
  );
  return v_result;
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.rebuild_payment_schedule_for_booking(uuid) from public;
grant execute on function public.rebuild_payment_schedule_for_booking(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Job processing
-- -----------------------------------------------------------------------------

create or replace function public.process_cld_schedule_sync_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
  v_status text;
  v_processed int := 0;
  v_booking_id uuid;
  v_err text;
begin
  if p_job_id is null then
    return jsonb_build_object('ok', false, 'error', 'job_id_required');
  end if;

  -- Claim (must be queued).
  update public.cld_schedule_sync_jobs
  set
    status = 'processing',
    attempts = attempts + 1,
    last_error = null
  where id = p_job_id
    and status = 'queued'
  returning project_id, status into v_project_id, v_status;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'error', 'job_not_queued_or_missing');
  end if;

  if not public.is_cld_eligible_project(v_project_id) then
    update public.cld_schedule_sync_jobs
    set status = 'cancelled', processed_at = now(), last_error = 'project_not_eligible'
    where id = p_job_id;
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'project_not_eligible');
  end if;

  for v_booking_id in
    select b.id
    from public.bookings b
    where b.project_id = v_project_id
      and b.status = 'active'
  loop
    perform public.rebuild_payment_schedule_for_booking(v_booking_id);
    v_processed := v_processed + 1;
  end loop;

  update public.cld_schedule_sync_jobs
  set status = 'done', processed_at = now()
  where id = p_job_id;

  return jsonb_build_object('ok', true, 'project_id', v_project_id, 'bookings_processed', v_processed);
exception
  when others then
    v_err := sqlerrm;
    update public.cld_schedule_sync_jobs
    set status = 'failed', last_error = v_err
    where id = p_job_id;
    return jsonb_build_object('ok', false, 'error', v_err);
end;
$$;

revoke all on function public.process_cld_schedule_sync_job(uuid) from public;
grant execute on function public.process_cld_schedule_sync_job(uuid) to service_role;

create or replace function public.process_next_cld_schedule_sync_job()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_job_id uuid;
  v_result jsonb;
begin
  select j.id
  into v_job_id
  from public.cld_schedule_sync_jobs j
  where j.status = 'queued'
    and j.scheduled_for <= now()
  order by j.scheduled_for asc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return jsonb_build_object('ok', true, 'processed', false);
  end if;

  v_result := public.process_cld_schedule_sync_job(v_job_id);
  return jsonb_build_object('ok', true, 'processed', true, 'job_id', v_job_id, 'result', v_result);
end;
$$;

revoke all on function public.process_next_cld_schedule_sync_job() from public;
grant execute on function public.process_next_cld_schedule_sync_job() to service_role;

