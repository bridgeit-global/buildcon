-- `authenticated` has no USAGE on schema `private` (revoked in profiles trigger migration).
-- `can_manage_project_members()` calls `private.is_project_manager`. As a normal SQL function it
-- ran as the invoker, so any evaluation (including via RLS) raised:
--   permission denied for schema private
--
-- Run as definer so `private.*` helpers stay hidden from callers.
create or replace function public.can_manage_project_members(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin()
  or private.is_project_manager(p_project_id, auth.uid());
$$;

grant execute on function public.can_manage_project_members(uuid) to authenticated;

-- `FOR ALL` duplicated SELECT rules and forced `can_manage_project_members` on reads.
-- Keep SELECT on `has_project_access` only; mutations stay manager/admin-only.
drop policy if exists "project_members_mutate_admin_or_manager" on public.project_members;

create policy "project_members_insert_admin_or_manager"
on public.project_members
for insert
with check (public.can_manage_project_members(project_id));

create policy "project_members_update_admin_or_manager"
on public.project_members
for update
using (public.can_manage_project_members(project_id))
with check (public.can_manage_project_members(project_id));

create policy "project_members_delete_admin_or_manager"
on public.project_members
for delete
using (public.can_manage_project_members(project_id));
