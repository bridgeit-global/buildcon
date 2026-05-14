-- Sales matrix fields: areas (carpet/BUA/RERA), outdoor, floor rise & PLC (₹), parking slots on unit.

alter table public.units
  add column if not exists carpet_area numeric,
  add column if not exists bua_area numeric,
  add column if not exists rera_area numeric,
  add column if not exists terrace_sqft numeric,
  add column if not exists deck_sqft numeric,
  add column if not exists loading_sqft numeric,
  add column if not exists floor_rise_charge integer not null default 0,
  add column if not exists plc_charge integer not null default 0,
  add column if not exists parking_slots_included smallint not null default 0;

comment on column public.units.area is 'Legacy / primary saleable sq.ft when carpet & BUA are unset';
comment on column public.units.carpet_area is 'Carpet area (sq.ft)';
comment on column public.units.bua_area is 'Built-up area (sq.ft)';
comment on column public.units.rera_area is 'RERA declared area (sq.ft)';
comment on column public.units.floor_rise_charge is 'Floor-rise premium in INR (lump sum on unit)';
comment on column public.units.plc_charge is 'PLC / preferential charges in INR (lump sum)';
comment on column public.units.parking_slots_included is 'Covered slots bundled with this unit';

-- Realtime (no-op if already member)
do $migration$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'units'
  ) then
    alter publication supabase_realtime add table public.units;
  end if;
end
$migration$;
