-- Org-wide master lookup lists: lead sources, unit types, unit categories.

create table if not exists public.master_lookup_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint master_lookup_kind_chk check (
    kind in ('lead_source', 'unit_type', 'unit_category')
  ),
  constraint master_lookup_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists master_lookup_kind_name_unique
  on public.master_lookup_items (kind, lower(trim(name)));

create index if not exists master_lookup_kind_active_sort_idx
  on public.master_lookup_items (kind, is_active, sort_order);

alter table public.master_lookup_items enable row level security;

create policy "master_lookup_read_authenticated"
on public.master_lookup_items
for select
using (auth.role() = 'authenticated');

create policy "master_lookup_mutate_org_admin"
on public.master_lookup_items
for all
using (public.is_org_admin())
with check (public.is_org_admin());

-- Optional unit grouping on inventory rows.
alter table public.units
  add column if not exists unit_category text;

-- Seed defaults (idempotent).
insert into public.master_lookup_items (kind, name, sort_order)
select v.kind, v.name, v.sort_order
from (
  values
    ('lead_source', 'Direct', 0),
    ('lead_source', 'Broker', 1),
    ('lead_source', 'Referral', 2),
    ('lead_source', 'Social Media', 3),
    ('lead_source', 'Website', 4),
    ('lead_source', 'Other', 5),
    ('unit_type', '1RK', 0),
    ('unit_type', '1BHK', 1),
    ('unit_type', '1.5BHK', 2),
    ('unit_type', '2BHK', 3),
    ('unit_type', '2.5BHK', 4),
    ('unit_type', '3BHK', 5),
    ('unit_type', '3.5BHK', 6),
    ('unit_type', '4BHK', 7),
    ('unit_type', '5BHK', 8),
    ('unit_type', 'Studio', 9),
    ('unit_type', 'Duplex', 10),
    ('unit_type', 'Penthouse', 11),
    ('unit_type', 'Shop', 12),
    ('unit_type', 'Office', 13),
    ('unit_category', 'Residential', 0),
    ('unit_category', 'Commercial', 1),
    ('unit_category', 'Retail', 2),
    ('unit_category', 'Office', 3),
    ('unit_category', 'Mixed Use', 4),
    ('unit_category', 'Other', 5)
) as v(kind, name, sort_order)
where not exists (
  select 1
  from public.master_lookup_items m
  where m.kind = v.kind
    and lower(trim(m.name)) = lower(trim(v.name))
);
