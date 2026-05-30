-- Remove CLD auto demand-letter PDF queue (manual generation from Financials remains).

drop function if exists public.pick_next_cld_demand_letter_job();
drop function if exists public.complete_cld_demand_letter_job(uuid, int, int, text);
drop function if exists public.claim_cld_demand_letter_job(uuid);
drop function if exists public.cld_demand_letter_jobs_touch_updated_at() cascade;

drop table if exists public.cld_demand_letter_jobs;

-- Re-apply completion handler without job enqueue (idempotent if 20260530150000 already ran).
create or replace function public.apply_cld_stage_completion(p_completion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
  v_stage_id uuid;
  v_completed_on date;
  v_instalment_no int;
  v_milestone text;
  v_demand_kind text;
  v_demand_value numeric;
  v_bookings_processed int := 0;
  v_schedules_updated int := 0;
  r record;
  v_booking_amount numeric;
  v_sale_total numeric;
  v_target numeric;
  v_amount numeric;
  v_schedule_id uuid;
  v_schedule_count int;
begin
  if p_completion_id is null then
    return jsonb_build_object('ok', false, 'error', 'completion_id_required');
  end if;

  select c.project_id, c.stage_id, c.completed_on
  into v_project_id, v_stage_id, v_completed_on
  from public.cld_stage_completions c
  where c.id = p_completion_id;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'error', 'completion_not_found');
  end if;

  if not public.is_cld_eligible_project(v_project_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'project_not_eligible');
  end if;

  select
    public.cld_instalment_no_for_stage(v_project_id, v_stage_id),
    public.cld_milestone_label(s.name, s.slab_label),
    s.demand_kind,
    s.demand_value
  into v_instalment_no, v_milestone, v_demand_kind, v_demand_value
  from public.project_cld_stages s
  where s.id = v_stage_id
    and s.project_id = v_project_id;

  if v_instalment_no is null then
    return jsonb_build_object('ok', false, 'error', 'cld_stage_not_found');
  end if;

  for r in
    select
      b.id as booking_id,
      coalesce(b.booking_amount, 0) as booking_amount,
      coalesce(b.sale_total_inr, 0) as sale_total_inr,
      b.stage_data
    from public.bookings b
    where b.project_id = v_project_id
      and b.status <> 'cancelled'
  loop
    v_bookings_processed := v_bookings_processed + 1;

    v_booking_amount := public.cld_resolve_booking_amount_inr(r.booking_amount, r.stage_data);
    v_sale_total := greatest(0, round(r.sale_total_inr));
    v_target := greatest(v_sale_total, v_booking_amount);
    v_amount := public.cld_stage_demand_amount(
      v_demand_kind,
      v_demand_value,
      v_target,
      v_instalment_no,
      v_booking_amount
    );

    select ps.id
    into v_schedule_id
    from public.payment_schedules ps
    where ps.booking_id = r.booking_id
      and ps.instalment_no = v_instalment_no;

    if v_schedule_id is not null then
      update public.payment_schedules ps
      set
        due_date = v_completed_on,
        milestone = v_milestone,
        amount = case
          when coalesce(ps.amount, 0) <= 0 and v_amount > 0 then v_amount
          else ps.amount
        end
      where ps.id = v_schedule_id;
      v_schedules_updated := v_schedules_updated + 1;
      continue;
    end if;

    select count(*)::int
    into v_schedule_count
    from public.payment_schedules ps
    where ps.booking_id = r.booking_id;

    if v_schedule_count <= 0 then
      perform public.rebuild_payment_schedule_for_booking(r.booking_id);

      update public.payment_schedules ps
      set
        due_date = v_completed_on,
        milestone = v_milestone
      where ps.booking_id = r.booking_id
        and ps.instalment_no = v_instalment_no;

      if found then
        v_schedules_updated := v_schedules_updated + 1;
      end if;
      continue;
    end if;

    insert into public.payment_schedules (booking_id, instalment_no, milestone, due_date, amount)
    values (r.booking_id, v_instalment_no, v_milestone, v_completed_on, v_amount);
    v_schedules_updated := v_schedules_updated + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'completion_id', p_completion_id,
    'bookings_processed', v_bookings_processed,
    'schedules_updated', v_schedules_updated
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;
