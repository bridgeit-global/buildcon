-- Wire CLD schedule sync job processing: stale reclaim, batch worker, pg_cron, booking enqueue.

create or replace function public.reclaim_stale_cld_schedule_sync_jobs(
  p_stale_minutes int default 15
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int;
begin
  update public.cld_schedule_sync_jobs
  set
    status = 'queued',
    last_error = coalesce(last_error, '') || case
      when coalesce(last_error, '') = '' then 'reclaimed_from_processing'
      else '; reclaimed_from_processing'
    end
  where status = 'processing'
    and updated_at < now() - make_interval(mins => greatest(p_stale_minutes, 1));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reclaim_stale_cld_schedule_sync_jobs(int) from public;
grant execute on function public.reclaim_stale_cld_schedule_sync_jobs(int) to service_role;

create or replace function public.process_pending_cld_schedule_sync_jobs(
  p_limit int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_limit int := greatest(coalesce(p_limit, 25), 1);
  v_reclaimed int;
  v_processed int := 0;
  v_failed int := 0;
  v_result jsonb;
  v_job_id uuid;
begin
  v_reclaimed := public.reclaim_stale_cld_schedule_sync_jobs(15);

  while v_processed + v_failed < v_limit loop
    select j.id
    into v_job_id
    from public.cld_schedule_sync_jobs j
    where j.status = 'queued'
      and j.scheduled_for <= now()
    order by j.scheduled_for asc, j.created_at asc
    for update skip locked
    limit 1;

    exit when v_job_id is null;

    v_result := public.process_cld_schedule_sync_job(v_job_id);

    if coalesce((v_result->>'ok')::boolean, false) then
      v_processed := v_processed + 1;
    else
      v_failed := v_failed + 1;
    end if;

    v_job_id := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reclaimed', v_reclaimed,
    'processed', v_processed,
    'failed', v_failed
  );
end;
$$;

revoke all on function public.process_pending_cld_schedule_sync_jobs(int) from public;
grant execute on function public.process_pending_cld_schedule_sync_jobs(int) to service_role;

-- Enqueue when booking financial totals change (eligible projects only).
create or replace function public.trg_bookings_enqueue_cld_schedule_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.sale_total_inr, 0) <= 0 and coalesce(new.booking_amount, 0) <= 0 then
      return new;
    end if;
    v_reason := 'booking_insert';
  elsif tg_op = 'UPDATE' then
    if coalesce(old.sale_total_inr, 0) is not distinct from coalesce(new.sale_total_inr, 0)
       and coalesce(old.booking_amount, 0) is not distinct from coalesce(new.booking_amount, 0) then
      return new;
    end if;
    if coalesce(new.sale_total_inr, 0) <= 0 and coalesce(new.booking_amount, 0) <= 0 then
      return new;
    end if;
    v_reason := 'booking_financial_update';
  else
    return coalesce(old, new);
  end if;

  perform public.enqueue_cld_schedule_sync(new.project_id, v_reason, now());

  return new;
end;
$$;

drop trigger if exists bookings_enqueue_cld_schedule_sync on public.bookings;
create trigger bookings_enqueue_cld_schedule_sync
after insert or update of sale_total_inr, booking_amount on public.bookings
for each row execute function public.trg_bookings_enqueue_cld_schedule_sync();

-- Improve single-job processor: fail the job when a booking rebuild fails.
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
  v_rebuild jsonb;
  v_err text;
begin
  if p_job_id is null then
    return jsonb_build_object('ok', false, 'error', 'job_id_required');
  end if;

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
    v_rebuild := public.rebuild_payment_schedule_for_booking(v_booking_id);
    if coalesce((v_rebuild->>'ok')::boolean, false) is not true
       and coalesce(v_rebuild->>'skipped', 'false') <> 'true' then
      raise exception 'rebuild_payment_schedule_for_booking failed for %: %',
        v_booking_id,
        coalesce(v_rebuild->>'error', v_rebuild::text);
    end if;
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
    set status = 'failed', last_error = v_err, processed_at = now()
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
  v_result jsonb;
begin
  v_result := public.process_pending_cld_schedule_sync_jobs(1);
  if coalesce((v_result->>'processed')::int, 0) > 0 then
    return jsonb_build_object('ok', true, 'processed', true, 'batch', v_result);
  end if;
  return jsonb_build_object('ok', true, 'processed', false, 'batch', v_result);
end;
$$;

revoke all on function public.process_next_cld_schedule_sync_job() from public;
grant execute on function public.process_next_cld_schedule_sync_job() to service_role;

-- Run worker every minute via pg_cron (available on Supabase hosted projects).
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'cld-schedule-sync-worker';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'cld-schedule-sync-worker',
  '* * * * *',
  $$select public.process_pending_cld_schedule_sync_jobs(25)$$
);
