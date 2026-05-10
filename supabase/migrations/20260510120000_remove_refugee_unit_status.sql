-- Deprecate RF (legacy Refugee) unit status: normalize existing rows to Available.
update public.units
set status = 'A'
where status = 'RF';
