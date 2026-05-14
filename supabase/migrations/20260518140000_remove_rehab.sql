-- Remove rehab: tables, unit mapping, and REHAB_RSV status. Rehab-reserved units become blocked.

update public.units
set
  status = 'BLOCKED',
  blocked_reason = coalesce(
    nullif(trim(blocked_reason), ''),
    'Legacy rehab reservation'
  ),
  blocked_on = coalesce(blocked_on, current_date)
where upper(trim(status)) in ('REHAB_RSV', 'RR');

update public.units
set rehab_member_id = null
where rehab_member_id is not null;

drop table if exists public.rehab_rent_entries cascade;
drop table if exists public.rehab_members cascade;

alter table public.units drop column if exists rehab_member_id;

alter table public.units drop constraint if exists units_status_chk;

alter table public.units
  add constraint units_status_chk check (
    status in (
      'AVAILABLE',
      'BLOCKED',
      'TOKEN',
      'BOOKED',
      'AGREEMENT',
      'REGISTERED',
      'PRE_POSSESSION',
      'POSSESSED',
      'CANCELLED'
    )
  );
