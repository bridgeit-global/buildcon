-- Project names must be unique (case-insensitive, trimmed).
create unique index if not exists projects_name_normalized_unique
  on public.projects (lower(btrim(name)));
