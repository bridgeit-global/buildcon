-- Project document HTML templates: typed kinds, active flag, admin-only mutate.

alter table public.document_templates
  add column if not exists doc_kind text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.document_templates
  drop constraint if exists document_templates_doc_kind_check;

alter table public.document_templates
  add constraint document_templates_doc_kind_check
  check (
    doc_kind is null
    or doc_kind in (
      'application-form',
      'allotment-letter',
      'agreement',
      'registration-deed',
      'demand-letter'
    )
  );

comment on column public.document_templates.doc_kind is
  'Booking document kind this HTML template generates. Null for legacy/unnamed rows.';

create unique index if not exists document_templates_project_doc_kind_uidx
  on public.document_templates (project_id, doc_kind)
  where doc_kind is not null;

create or replace function public.document_templates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists document_templates_touch_updated_at on public.document_templates;

create trigger document_templates_touch_updated_at
before update on public.document_templates
for each row
execute function public.document_templates_touch_updated_at();

-- Keep project-scoped read; restrict create/update/delete to org admins.
drop policy if exists "document_templates_mutate_project" on public.document_templates;

create policy "document_templates_insert_org_admin"
on public.document_templates
for insert
with check (public.is_org_admin() and public.has_project_access(project_id));

create policy "document_templates_update_org_admin"
on public.document_templates
for update
using (public.is_org_admin() and public.has_project_access(project_id))
with check (public.is_org_admin() and public.has_project_access(project_id));

create policy "document_templates_delete_org_admin"
on public.document_templates
for delete
using (public.is_org_admin() and public.has_project_access(project_id));
