-- Allow SMTP (Nodemailer) as email provider; keep resend for historical audit rows.
alter table public.outbound_notifications
  drop constraint if exists outbound_notifications_provider_chk;

alter table public.outbound_notifications
  add constraint outbound_notifications_provider_chk
  check (provider in ('resend', 'smtp', 'meta_cloud'));
