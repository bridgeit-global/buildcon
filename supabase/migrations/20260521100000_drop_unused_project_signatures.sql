-- project_signatures was never used by the app (no queries or FKs). Drop to reduce schema surface.

drop table if exists public.project_signatures cascade;
