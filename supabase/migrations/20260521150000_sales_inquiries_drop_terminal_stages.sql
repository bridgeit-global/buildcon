-- Funnel ends at Token; Booking / Won / Lost are not inquiry stages.

update public.sales_inquiries
set funnel_stage = 'Token'
where funnel_stage in ('Booking', 'Won');

update public.sales_inquiries
set
  funnel_stage = 'Enquiry',
  stage_data = coalesce(stage_data, '{}'::jsonb) || '{"closed":true}'::jsonb
where funnel_stage = 'Lost';

alter table public.sales_inquiries
  drop constraint if exists sales_inquiries_funnel_stage_chk;

alter table public.sales_inquiries
  add constraint sales_inquiries_funnel_stage_chk check (
    funnel_stage in (
      'Enquiry',
      'Qualified',
      'Site Visit',
      'Negotiation',
      'Token'
    )
  );

create or replace function public.unit_status_for_funnel_stage(
  p_funnel_stage text,
  p_current_status text
)
returns text
language plpgsql
immutable
as $$
declare
  fs text := trim(coalesce(p_funnel_stage, ''));
  s text := upper(trim(coalesce(p_current_status, '')));
begin
  if fs = 'Qualified' then
    if s in ('AVAILABLE', 'A') then
      return 'BLOCKED';
    end if;
    return null;
  end if;

  if fs = 'Token' then
    if s in ('AVAILABLE', 'A', 'BLOCKED', 'BL') then
      return 'TOKEN';
    end if;
    return null;
  end if;

  return null;
end;
$$;
