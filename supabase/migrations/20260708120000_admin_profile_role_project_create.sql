-- Admin profile role: can create projects (same wizard flow as Super Admin) but
-- does not inherit Super Admin system-wide privileges.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Admin'
  );
$$;

create or replace function public.can_create_project()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin() or public.is_admin();
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_create_project() to authenticated;

drop policy if exists "projects_insert_super_admin" on public.projects;

create policy "projects_insert_creator"
on public.projects
for insert
with check (public.can_create_project());
