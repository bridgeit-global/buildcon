-- Customer / application form: relation, secondary phone, ID proof, expanded addresses.

alter table public.customers
  add column if not exists guardian_relation text,
  add column if not exists phone_secondary text,
  add column if not exists id_proof_type text;

comment on column public.customers.guardian_relation is 'Relationship to guardian name (Father, Mother, Spouse, etc.)';
comment on column public.customers.phone_secondary is 'Secondary mobile number';
comment on column public.customers.id_proof_type is 'ID proof document type submitted with application form';

alter table public.customer_addresses
  add column if not exists address_line2 text,
  add column if not exists address_line3 text;

-- Extend master lookup kinds for customizable customer relation options.
alter table public.master_lookup_items drop constraint if exists master_lookup_kind_chk;

alter table public.master_lookup_items add constraint master_lookup_kind_chk check (
  kind in ('lead_source', 'unit_type', 'unit_category', 'customer_relation')
);

insert into public.master_lookup_items (kind, name, sort_order)
select v.kind, v.name, v.sort_order
from (
  values
    ('customer_relation', 'Father', 0),
    ('customer_relation', 'Mother', 1),
    ('customer_relation', 'Spouse', 2),
    ('customer_relation', 'Guardian', 3),
    ('customer_relation', 'Other', 4)
) as v(kind, name, sort_order)
where not exists (
  select 1
  from public.master_lookup_items m
  where m.kind = v.kind
    and lower(trim(m.name)) = lower(trim(v.name))
);
