-- Brand logo path on organization settings (safe if already present).

alter table public.organization_settings
  add column if not exists logo_storage_path text;
