-- CLD schedules: amounts/milestones on sync; due_date only when that stage is logged complete at project level.
-- Paid status remains collections-driven (never set by completion trigger).

create or replace function public.cld_due_date_for_project_instalment(
  p_project_id uuid,
  p_instalment_no int
)
returns date
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.completed_on
  from public.cld_stage_completions c
  inner join lateral (
    select st.id
    from public.project_cld_stages st
    where st.project_id = p_project_id
    order by st.sort_order asc, st.created_at asc
    offset greatest(0, p_instalment_no - 1)
    limit 1
  ) st on st.id = c.stage_id
  where c.project_id = p_project_id
  order by c.completed_on desc, c.created_at desc
  limit 1;
$$;

revoke all on function public.cld_due_date_for_project_instalment(uuid, int) from public;
grant execute on function public.cld_due_date_for_project_instalment(uuid, int) to authenticated;

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
      public.cld_due_date_for_project_instalment(
        v_project_id,
        (row_number() over (order by s.sort_order, s.created_at))::int
      ) as due_date,
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
      due_date = coalesce(
        public.cld_due_date_for_project_instalment(v_project_id, r.instalment_no),
        case when round(r.received_amount) > 0 then r.existing_due_date else null end,
        t.due_date
      )
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

-- Clear auto-assigned due dates on CLD rows that were never completed at project level.
update public.payment_schedules ps
set due_date = null
from public.bookings b
where ps.booking_id = b.id
  and b.status <> 'cancelled'
  and public.is_cld_eligible_project(b.project_id)
  and ps.due_date is not null
  and exists (
    select 1 from public.project_cld_stages s where s.project_id = b.project_id
  )
  and public.cld_due_date_for_project_instalment(b.project_id, ps.instalment_no) is null;
