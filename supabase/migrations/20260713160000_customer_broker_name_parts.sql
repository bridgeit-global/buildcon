-- Split customer / broker display names into first / middle / last.
-- Keep full_name as the synced display field for lists, joins, and prints.

alter table public.customers
  add column if not exists first_name text not null default '',
  add column if not exists middle_name text,
  add column if not exists last_name text not null default '';

alter table public.brokers
  add column if not exists first_name text not null default '',
  add column if not exists middle_name text,
  add column if not exists last_name text not null default '';

-- Best-effort backfill from existing full_name.
update public.customers c
set
  first_name = case
    when cardinality(split.parts) = 0 then ''
    when split.parts[1] = '' then ''
    else split.parts[1]
  end,
  middle_name = case
    when cardinality(split.parts) > 2 then array_to_string(split.parts[2:cardinality(split.parts) - 1], ' ')
    else null
  end,
  last_name = case
    when cardinality(split.parts) >= 2 then split.parts[cardinality(split.parts)]
    else ''
  end
from (
  select
    id,
    string_to_array(regexp_replace(trim(coalesce(full_name, '')), '\s+', ' ', 'g'), ' ') as parts
  from public.customers
) as split
where c.id = split.id
  and coalesce(c.first_name, '') = ''
  and coalesce(c.last_name, '') = '';

update public.brokers b
set
  first_name = case
    when cardinality(split.parts) = 0 then ''
    when split.parts[1] = '' then ''
    else split.parts[1]
  end,
  middle_name = case
    when cardinality(split.parts) > 2 then array_to_string(split.parts[2:cardinality(split.parts) - 1], ' ')
    else null
  end,
  last_name = case
    when cardinality(split.parts) >= 2 then split.parts[cardinality(split.parts)]
    else ''
  end
from (
  select
    id,
    string_to_array(regexp_replace(trim(coalesce(full_name, '')), '\s+', ' ', 'g'), ' ') as parts
  from public.brokers
) as split
where b.id = split.id
  and coalesce(b.first_name, '') = ''
  and coalesce(b.last_name, '') = '';
create or replace function public.sync_person_full_name()
returns trigger
language plpgsql
as $$
declare
  composed text;
begin
  composed := trim(both ' ' from concat_ws(
    ' ',
    nullif(trim(both ' ' from coalesce(new.first_name, '')), ''),
    nullif(trim(both ' ' from coalesce(new.middle_name, '')), ''),
    nullif(trim(both ' ' from coalesce(new.last_name, '')), '')
  ));

  if composed <> '' then
    new.full_name := composed;
  elsif coalesce(trim(both ' ' from new.full_name), '') = '' then
    new.full_name := '';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_sync_full_name on public.customers;
create trigger customers_sync_full_name
  before insert or update of first_name, middle_name, last_name, full_name
  on public.customers
  for each row
  execute function public.sync_person_full_name();

drop trigger if exists brokers_sync_full_name on public.brokers;
create trigger brokers_sync_full_name
  before insert or update of first_name, middle_name, last_name, full_name
  on public.brokers
  for each row
  execute function public.sync_person_full_name();
