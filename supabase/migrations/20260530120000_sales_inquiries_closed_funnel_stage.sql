-- Terminal funnel stage for closed enquiries (not interested, rejected, duplicate, etc.).

update public.sales_inquiries
set funnel_stage = 'Closed'
where coalesce(stage_data->>'closed', '') = 'true'
  and funnel_stage is distinct from 'Closed';

alter table public.sales_inquiries
  drop constraint if exists sales_inquiries_funnel_stage_chk;

alter table public.sales_inquiries
  add constraint sales_inquiries_funnel_stage_chk check (
    funnel_stage in (
      'Enquiry',
      'Qualified',
      'Site Visit',
      'Negotiation',
      'Token',
      'Closed'
    )
  );
