-- CRM API routes call this via the service-role admin client after requireProjectAccess.
-- Skip has_project_access for service_role; authenticated callers still enforce it.

create or replace function public.set_unit_status_for_booking(
  p_booking_id uuid,
  p_target_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_workflow_stage text;
  v_status text;
  v_current text;
  v_allowed text[];
  v_project_id uuid;
begin
  if p_target_status is null or btrim(p_target_status) = '' then
    raise exception 'Target status is required';
  end if;
  v_status := upper(btrim(p_target_status));
  v_allowed := array['AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'BOOKED'];
  if not (v_status = any(v_allowed)) then
    raise exception 'Unsupported unit status transition: %', v_status;
  end if;

  select unit_id, workflow_stage, status, project_id
  into v_unit_id, v_workflow_stage, v_current, v_project_id
  from public.bookings
  where id = p_booking_id;

  if v_unit_id is null then
    raise exception 'Booking % not found', p_booking_id;
  end if;
  if v_current is not null and v_current = 'cancelled' then
    raise exception 'Booking is cancelled';
  end if;
  if v_workflow_stage <> 'confirmation' then
    raise exception 'Booking must be confirmed before changing unit status';
  end if;

  if auth.role() is distinct from 'service_role' then
    if not public.has_project_access(v_project_id) then
      raise exception 'Forbidden';
    end if;
  end if;

  -- Idempotent: skip if already at the target status.
  if (select status from public.units where id = v_unit_id) = v_status then
    return v_status;
  end if;

  update public.units
  set status = v_status
  where id = v_unit_id;

  return v_status;
end;
$$;

grant execute on function public.set_unit_status_for_booking(uuid, text) to service_role;
