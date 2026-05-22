-- In-app notifications for CRM staff (negotiation approvals, expected close, etc.)

create table if not exists public.crm_user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_user_notifications_user_unread_idx
  on public.crm_user_notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists crm_user_notifications_user_created_idx
  on public.crm_user_notifications (user_id, created_at desc);

alter table public.crm_user_notifications enable row level security;

create policy "crm_user_notifications_select_own"
on public.crm_user_notifications
for select
using (user_id = auth.uid());

create policy "crm_user_notifications_update_own"
on public.crm_user_notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
