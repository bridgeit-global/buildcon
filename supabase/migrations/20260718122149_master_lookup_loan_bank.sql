-- Extend master lookup kinds for loan bank options on bookings.

alter table public.master_lookup_items drop constraint if exists master_lookup_kind_chk;

alter table public.master_lookup_items add constraint master_lookup_kind_chk check (
  kind in (
    'lead_source',
    'unit_type',
    'unit_category',
    'customer_relation',
    'loan_bank'
  )
);

insert into public.master_lookup_items (kind, name, sort_order)
select v.kind, v.name, v.sort_order
from (
  values
    ('loan_bank', 'HDFC Bank', 0),
    ('loan_bank', 'SBI Bank', 1),
    ('loan_bank', 'Axis Bank', 2),
    ('loan_bank', 'ICICI Bank', 3),
    ('loan_bank', 'Bank of Baroda', 4)
) as v(kind, name, sort_order)
where not exists (
  select 1
  from public.master_lookup_items m
  where m.kind = v.kind
    and lower(trim(m.name)) = lower(trim(v.name))
);
