-- Persist enquiry wizard navigation + unsaved draft snapshots for resume across sessions.

alter table public.sales_inquiries
  add column if not exists wizard_ui jsonb not null default '{}'::jsonb;

comment on column public.sales_inquiries.wizard_ui is
  'Wizard navigation state: view_stage, wizard_step, per-step draft snapshots, dirty flags.';
