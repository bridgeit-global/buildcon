-- Admin keeps org-level privileges (create projects, masters, users, org settings)
-- but project data access is membership-scoped. Only Super Admin sees every project.

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

create or replace function public.can_manage_project_members(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin()
  or (
    public.is_admin()
    and public.has_project_access(p_project_id)
  )
  or private.is_project_manager(p_project_id, auth.uid());
$$;

-- Project / wing / unit-type mutations: org admins only on projects they can access.
drop policy if exists "projects_update_org_admin" on public.projects;
create policy "projects_update_org_admin"
on public.projects
for update
using (public.is_org_admin() and public.has_project_access(id))
with check (public.is_org_admin() and public.has_project_access(id));

drop policy if exists "wings_mutate_org_admin" on public.project_wings;
create policy "wings_mutate_org_admin"
on public.project_wings
for all
using (public.is_org_admin() and public.has_project_access(project_id))
with check (public.is_org_admin() and public.has_project_access(project_id));

drop policy if exists "unit_types_mutate_org_admin" on public.project_unit_types;
create policy "unit_types_mutate_org_admin"
on public.project_unit_types
for all
using (public.is_org_admin() and public.has_project_access(project_id))
with check (public.is_org_admin() and public.has_project_access(project_id));

drop policy if exists "negotiation_approvals_update_org_admin" on public.negotiation_approvals;
create policy "negotiation_approvals_update_org_admin"
on public.negotiation_approvals
for update
using (public.is_org_admin() and public.has_project_access(project_id))
with check (public.is_org_admin() and public.has_project_access(project_id));

create or replace function public.decide_negotiation_approval(
  p_approval_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns public.negotiation_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.negotiation_approvals;
  v_status text;
  v_inq_stage_data jsonb;
  v_decision_label text;
  v_project_id uuid;
begin
  select project_id into v_project_id
  from public.negotiation_approvals
  where id = p_approval_id;

  if v_project_id is null then
    raise exception 'Approval not found';
  end if;

  if not (
    public.is_super_admin()
    or (public.is_admin() and public.has_project_access(v_project_id))
  ) then
    raise exception 'Only org admins with project access can decide negotiation approvals';
  end if;

  v_decision_label := lower(coalesce(p_decision, ''));
  if v_decision_label = 'approve' or v_decision_label = 'approved' then
    v_status := 'Approved';
  elsif v_decision_label = 'reject' or v_decision_label = 'rejected' then
    v_status := 'Rejected';
  else
    raise exception 'Decision must be approve or reject (got %)', p_decision;
  end if;

  update public.negotiation_approvals
  set
    status = v_status,
    decision_note = p_decision_note,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_approval_id
    and status = 'Pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Approval not found or already decided';
  end if;

  select stage_data into v_inq_stage_data
  from public.sales_inquiries
  where id = v_row.sales_inquiry_id;

  if v_inq_stage_data is null then
    v_inq_stage_data := '{}'::jsonb;
  end if;

  v_inq_stage_data := jsonb_set(
    v_inq_stage_data,
    '{negotiation}',
    coalesce(v_inq_stage_data -> 'negotiation', '{}'::jsonb)
      || jsonb_build_object(
        'approval_status', lower(v_status),
        'approval_id', v_row.id,
        'offered_price', v_row.offered_price::text,
        'decision_note', coalesce(p_decision_note, ''),
        'decided_at', to_char(v_row.decided_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')
      ),
    true
  );

  update public.sales_inquiries
  set stage_data = v_inq_stage_data
  where id = v_row.sales_inquiry_id;

  return v_row;
end;
$$;
