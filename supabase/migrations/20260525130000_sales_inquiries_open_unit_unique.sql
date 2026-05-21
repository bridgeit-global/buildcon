-- Hard guardrail: at most one open inquiry per unit. A second concurrent
-- inquiry attempting to attach the same unit_id will fail at insert time.

-- Remote may already have duplicate open rows; close extras before the index.
with open_ranked as (
  select
    i.id,
    row_number() over (
      partition by i.unit_id
      order by
        exists (
          select 1
          from public.bookings b
          where b.sales_inquiry_id = i.id
            and b.status is distinct from 'cancelled'
        ) desc,
        case i.funnel_stage
          when 'Token' then 5
          when 'Negotiation' then 4
          when 'Site Visit' then 3
          when 'Qualified' then 2
          else 1
        end desc,
        i.updated_at desc,
        i.created_at desc
    ) as rn
  from public.sales_inquiries i
  where i.unit_id is not null
    and (i.stage_data->>'closed') is distinct from 'true'
)
update public.sales_inquiries si
set
  funnel_stage = 'Enquiry',
  stage_data = coalesce(si.stage_data, '{}'::jsonb)
    || jsonb_build_object('closed', true, 'closed_status', 'Duplicate')
from open_ranked r
where si.id = r.id
  and r.rn > 1;

create unique index if not exists sales_inquiries_open_unit_unique
  on public.sales_inquiries (unit_id)
  where unit_id is not null
    and (stage_data->>'closed') is distinct from 'true';
