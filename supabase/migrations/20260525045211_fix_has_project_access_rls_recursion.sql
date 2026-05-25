-- Fix infinite RLS recursion: has_project_access() queries project_members,
-- whose SELECT policy calls has_project_access() back → stack overflow for
-- non-Super Admin users. Super Admins were unaffected because is_super_admin()
-- short-circuits before project_members is ever touched.
--
-- Solution: SECURITY DEFINER + SET row_security = off, matching the existing
-- pattern used by can_manage_project_members() and private.is_project_manager().

create or replace function public.is_super_admin()
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
      and p.role = 'Super Admin'
  );
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'Active'
  );
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_project_access(uuid) to authenticated;
