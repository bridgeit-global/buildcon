-- Allow project Managers (and Super Admin) to manage project members for their project.
-- This enables delegated access control without granting global admin.

create schema if not exists private;

-- Security-definer helper to avoid RLS recursion when checking membership/role.
create or replace function private.is_project_manager(
  p_project_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.status = 'Active'
      and pm.role = 'Manager'
  );
$$;

create or replace function public.can_manage_project_members(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_super_admin()
  or private.is_project_manager(p_project_id, auth.uid());
$$;

-- Replace Super Admin-only mutation with Admin OR Project Manager (per-project).
drop policy if exists "project_members_mutate_super_admin" on public.project_members;
drop policy if exists "project_members_mutate_admin_or_manager" on public.project_members;

create policy "project_members_mutate_admin_or_manager"
on public.project_members
for all
using (public.can_manage_project_members(project_id))
with check (public.can_manage_project_members(project_id));

