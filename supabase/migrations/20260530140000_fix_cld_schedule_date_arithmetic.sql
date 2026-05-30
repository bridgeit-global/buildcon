-- Fix date arithmetic: row_number() yields bigint; date + bigint is invalid in Postgres.

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
    insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
    values (p_booking_id, 1, 'Booking Amount', current_date, case when v_booking_amount > 0 then v_booking_amount else v_target end);

    if v_target - (case when v_booking_amount > 0 then v_booking_amount else v_target end) > 0 then
      insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
      values (p_booking_id, 2, 'Pending Amount', current_date + 30, v_target - (case when v_booking_amount > 0 then v_booking_amount else v_target end));
    end if;
  else
    insert into tmp_target_schedules (booking_id, instalment_no, milestone, due_date, amount)
    select
      p_booking_id as booking_id,
      (row_number() over (order by s.sort_order, s.created_at))::int as instalment_no,
      case
        when (row_number() over (order by s.sort_order, s.created_at)) = 1 and v_booking_amount > 0
          then 'Booking Amount'
        else public.cld_milestone_label(s.name, s.slab_label)
      end as milestone,
      (current_date + (((row_number() over (order by s.sort_order, s.created_at))::int - 1) * 30))::date as due_date,
      case
        when (row_number() over (order by s.sort_order, s.created_at)) = 1 and v_booking_amount > 0
          then v_booking_amount
        when s.demand_kind = 'fixed'
          then greatest(0, round(coalesce(s.demand_value, 0)))
        else greatest(0, round((v_target * (coalesce(s.demand_value, 0))) / 100))
      end as amount
    from public.project_cld_stages s
    where s.project_id = v_project_id;

    select coalesce(sum(t.amount), 0) into v_sum from tmp_target_schedules t;
    v_delta := v_target - v_sum;
    if v_delta <> 0 then
      update tmp_target_schedules
      set amount = greatest(0, round(amount + v_delta))
      where instalment_no = (select max(instalment_no) from tmp_target_schedules);
    end if;
  end if;

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
