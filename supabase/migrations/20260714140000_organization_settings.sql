-- Singleton org profile: builder / developer identity for CRM admin + print docs.

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null default 'BuildCon',
  trade_name text not null default 'BuildCon',
  registered_address text,
  city text,
  state text,
  pin text,
  phone text,
  email text,
  website text,
  pan text,
  gstin text,
  cin text,
  rera_promoter_no text,
  authorized_signatory_name text,
  logo_storage_path text,
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  bank_ifsc text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint organization_settings_legal_name_nonempty check (length(trim(legal_name)) > 0),
  constraint organization_settings_trade_name_nonempty check (length(trim(trade_name)) > 0)
);

-- Enforce a single organization row for this deployment.
create unique index if not exists organization_settings_singleton
  on public.organization_settings ((true));

alter table public.organization_settings enable row level security;

create policy "organization_settings_read_authenticated"
on public.organization_settings
for select
using (auth.role() = 'authenticated');

create policy "organization_settings_update_org_admin"
on public.organization_settings
for update
using (public.is_org_admin())
with check (public.is_org_admin());

-- Seed the singleton (idempotent).
insert into public.organization_settings (legal_name, trade_name)
select 'BuildCon', 'BuildCon'
where not exists (select 1 from public.organization_settings);
