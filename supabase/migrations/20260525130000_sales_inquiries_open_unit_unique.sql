-- Hard guardrail: at most one open inquiry per unit. A second concurrent
-- inquiry attempting to attach the same unit_id will fail at insert time.
create unique index if not exists sales_inquiries_open_unit_unique
  on public.sales_inquiries (unit_id)
  where unit_id is not null
    and (stage_data->>'closed') is distinct from 'true';
