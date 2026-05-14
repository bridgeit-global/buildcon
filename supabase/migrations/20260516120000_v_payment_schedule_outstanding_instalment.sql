-- Add instalment_no to ledger view for finance exports and reporting.

create or replace view public.v_payment_schedule_outstanding as
select
  b.project_id,
  b.id as booking_id,
  b.customer_id,
  ps.id as schedule_id,
  ps.instalment_no,
  ps.milestone,
  ps.due_date,
  ps.amount::numeric as demand_amount,
  coalesce(
    (
      select sum(c.received_amount)::numeric
      from public.collections c
      where c.schedule_id = ps.id
    ),
    0
  ) as received_amount,
  greatest(
    ps.amount::numeric - coalesce(
      (
        select sum(c.received_amount)::numeric
        from public.collections c
        where c.schedule_id = ps.id
      ),
      0
    ),
    0
  ) as outstanding_amount,
  case
    when ps.due_date is not null
      and ps.due_date < (current_date)
      and ps.amount::numeric > coalesce(
        (
          select sum(c.received_amount)::numeric
          from public.collections c
          where c.schedule_id = ps.id
        ),
        0
      )
    then true
    else false
  end as is_overdue
from public.payment_schedules ps
join public.bookings b on b.id = ps.booking_id;

comment on view public.v_payment_schedule_outstanding is
  'Demand (schedule line) vs allocated collections; outstanding and overdue flags; includes instalment_no for exports.';

grant select on public.v_payment_schedule_outstanding to authenticated;
