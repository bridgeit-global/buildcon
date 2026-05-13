-- Canonical unit lifecycle statuses (PRD-aligned). Migrates legacy single-letter codes.

update public.units
set status = case upper(trim(status))
  when 'A' then 'AVAILABLE'
  when 'BL' then 'BLOCKED'
  when 'B' then 'BOOKED'
  when 'S' then 'REGISTERED'
  when 'RR' then 'REHAB_RSV'
  when 'RF' then 'AVAILABLE'
  else coalesce(nullif(trim(status), ''), 'AVAILABLE')
end
where upper(trim(status)) in ('A', 'BL', 'B', 'S', 'RR', 'RF')
   or trim(status) = '';

update public.units
set status = 'AVAILABLE'
where status is null
   or trim(status) = '';

update public.units
set status = 'AVAILABLE'
where status not in (
  'AVAILABLE',
  'BLOCKED',
  'TOKEN',
  'BOOKED',
  'AGREEMENT',
  'REGISTERED',
  'PRE_POSSESSION',
  'POSSESSED',
  'CANCELLED',
  'REHAB_RSV'
);

alter table public.units
  drop constraint if exists units_status_chk;

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
      'CANCELLED',
      'REHAB_RSV'
    )
  );

alter table public.units
  alter column status set default 'AVAILABLE';
