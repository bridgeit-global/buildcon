-- Align document_templates.doc_kind with every booking document generation kind.

alter table public.document_templates
  drop constraint if exists document_templates_doc_kind_check;

alter table public.document_templates
  add constraint document_templates_doc_kind_check
  check (
    doc_kind is null
    or doc_kind in (
      'application-form',
      'allotment-letter',
      'receipt',
      'demand-letter',
      'agreement',
      'registration-deed',
      'possession-letter'
    )
  );

comment on column public.document_templates.doc_kind is
  'Project-scoped booking document kind this HTML template generates. Null for legacy/unnamed rows.';
