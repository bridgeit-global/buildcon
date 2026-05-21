-- Outbound notifications audit + retry log for email (Resend) + WhatsApp (Meta Cloud API).
-- One row per (generated_document_id, channel) so re-tries are idempotent.

create table if not exists public.outbound_notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  generated_document_id uuid references public.generated_documents (id) on delete cascade,
  channel text not null,
  provider text not null,
  template_name text,
  status text not null default 'queued',
  provider_message_id text,
  recipient text,
  request jsonb,
  response jsonb,
  error text,
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_notifications_channel_chk check (channel in ('email', 'whatsapp')),
  constraint outbound_notifications_provider_chk check (provider in ('resend', 'meta_cloud')),
  constraint outbound_notifications_status_chk check (
    status in ('queued', 'sent', 'failed', 'delivered', 'read', 'skipped')
  )
);

-- One outbound row per (document, channel) — re-tries update in place.
create unique index if not exists outbound_notifications_doc_channel_unique
  on public.outbound_notifications (generated_document_id, channel)
  where generated_document_id is not null;

create index if not exists outbound_notifications_provider_message_idx
  on public.outbound_notifications (provider_message_id)
  where provider_message_id is not null;

create index if not exists outbound_notifications_unit_idx
  on public.outbound_notifications (unit_id, created_at desc);

create index if not exists outbound_notifications_booking_idx
  on public.outbound_notifications (booking_id, created_at desc);

create index if not exists outbound_notifications_pending_idx
  on public.outbound_notifications (status, scheduled_for)
  where status in ('queued', 'failed');

alter table public.outbound_notifications enable row level security;

create policy "outbound_notifications_select_project"
on public.outbound_notifications
for select
using (public.has_project_access(project_id));

create policy "outbound_notifications_mutate_project"
on public.outbound_notifications
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

create or replace function public.outbound_notifications_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists outbound_notifications_touch_updated_at on public.outbound_notifications;

create trigger outbound_notifications_touch_updated_at
before update on public.outbound_notifications
for each row execute function public.outbound_notifications_touch_updated_at();
