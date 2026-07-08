import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { protocol, rootDomain } from '@/lib/utils';
import { sendSmtpEmail } from './nodemailer-email';

export type CrmStaffNotificationInput = {
  userId: string;
  projectId?: string | null;
  kind: string;
  title: string;
  body: string;
  linkPath?: string | null;
  emailSubject?: string;
  emailHtml?: string;
};

async function loadUserEmail(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return String(data.user.email).trim() || null;
}

export type NotifyCrmUserResult = {
  ok: boolean;
  inApp: boolean;
  emailSent: boolean;
  email?: string;
  error?: string;
};

/** Comma-separated fallback addresses when no super-admin auth email is available. */
export function staffNotificationFallbackEmails(): string[] {
  const raw =
    process.env.CRM_STAFF_NOTIFICATION_EMAIL?.trim() ||
    process.env.CRM_NEGOTIATION_APPROVAL_EMAIL?.trim() ||
    '';
  if (!raw) return [];
  return [...new Set(raw.split(/[,;]/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Insert in-app notification and email the recipient (email is not blocked by insert failure). */
export async function notifyCrmUser(
  admin: SupabaseClient,
  input: CrmStaffNotificationInput
): Promise<NotifyCrmUserResult> {
  const userId = String(input.userId || '').trim();
  if (!userId) return { ok: false, inApp: false, emailSent: false, error: 'Missing user id' };

  const { error: insErr } = await admin.from('crm_user_notifications').insert({
    user_id: userId,
    project_id: input.projectId?.trim() || null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link_path: input.linkPath?.trim() || null
  });
  const inApp = !insErr;

  let emailSent = false;
  let email: string | undefined;
  if (input.emailSubject && input.emailHtml) {
    const to = await loadUserEmail(admin, userId);
    if (to) {
      email = to;
      const res = await sendSmtpEmail({
        to,
        subject: input.emailSubject,
        html: input.emailHtml
      });
      emailSent = res.ok;
    }
  }

  const ok = inApp || emailSent;
  return {
    ok,
    inApp,
    emailSent,
    email,
    error: ok ? undefined : insErr?.message ?? 'Could not notify user'
  };
}

export async function listOrgAdminUserIds(
  admin: SupabaseClient
): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['Super Admin', 'Admin']);
  if (error) return [];
  return (data ?? [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean);
}

/** @deprecated Use listOrgAdminUserIds */
export const listSuperAdminUserIds = listOrgAdminUserIds;

export async function listActiveProjectMemberUserIds(
  admin: SupabaseClient,
  projectId: string
): Promise<string[]> {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const { data, error } = await admin
    .from('project_members')
    .select('user_id')
    .eq('project_id', pid)
    .eq('status', 'Active');
  if (error) return [];
  return (data ?? [])
    .map((r) => String((r as { user_id?: string }).user_id ?? '').trim())
    .filter(Boolean);
}

export type NotifyManyCrmUsersResult = {
  inAppCount: number;
  emailsSent: number;
};

export async function notifyManyCrmUsers(
  admin: SupabaseClient,
  userIds: string[],
  input: Omit<CrmStaffNotificationInput, 'userId'>
): Promise<NotifyManyCrmUsersResult> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  let inAppCount = 0;
  let emailsSent = 0;
  const emailed = new Set<string>();

  for (const userId of unique) {
    const result = await notifyCrmUser(admin, { ...input, userId });
    if (result.inApp) inAppCount += 1;
    if (result.emailSent && result.email) {
      emailed.add(result.email.toLowerCase());
      emailsSent += 1;
    }
  }

  if (
    emailsSent === 0 &&
    input.emailSubject &&
    input.emailHtml
  ) {
    for (const to of staffNotificationFallbackEmails()) {
      if (emailed.has(to)) continue;
      const res = await sendSmtpEmail({
        to,
        subject: input.emailSubject,
        html: input.emailHtml
      });
      if (res.ok) {
        emailed.add(to);
        emailsSent += 1;
      }
    }
  }

  return { inAppCount, emailsSent };
}

function normalizeAppOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http')) return trimmed.replace(/\/$/, '');
  return `https://${trimmed}`;
}

function appOrigin(): string {
  const fromEnv = normalizeAppOrigin(
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    ''
  );
  if (fromEnv) return fromEnv;

  // Local dev: still emit absolute links (e.g. http://localhost:3000/...) in staff emails.
  if (process.env.NODE_ENV !== 'production') {
    return `${protocol}://${rootDomain}`;
  }
  return '';
}

export function crmAbsoluteLink(path: string): string {
  const origin = appOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}

export function staffNotificationEmailHtml(params: {
  title: string;
  body: string;
  linkPath?: string | null;
}): string {
  const link = params.linkPath ? crmAbsoluteLink(params.linkPath) : '';
  const href =
    link.startsWith('http://') || link.startsWith('https://') ? link : '';
  const cta = href
    ? `<p style="margin-top:16px"><a href="${href}" style="color:#0d9488;font-weight:600">Open in BuildCon CRM</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1e293b">
<p style="font-weight:600;margin:0 0 8px">${params.title}</p>
<p style="margin:0;line-height:1.5">${params.body}</p>
${cta}
</div>`;
}
