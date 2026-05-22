import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/** Insert in-app notification and optionally email the recipient. */
export async function notifyCrmUser(
  admin: SupabaseClient,
  input: CrmStaffNotificationInput
): Promise<{ ok: boolean; error?: string }> {
  const userId = String(input.userId || '').trim();
  if (!userId) return { ok: false, error: 'Missing user id' };

  const { error: insErr } = await admin.from('crm_user_notifications').insert({
    user_id: userId,
    project_id: input.projectId?.trim() || null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link_path: input.linkPath?.trim() || null
  });
  if (insErr) return { ok: false, error: insErr.message };

  const email = await loadUserEmail(admin, userId);
  if (email && input.emailSubject && input.emailHtml) {
    await sendSmtpEmail({
      to: email,
      subject: input.emailSubject,
      html: input.emailHtml
    });
  }

  return { ok: true };
}

export async function listSuperAdminUserIds(
  admin: SupabaseClient
): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'Super Admin');
  if (error) return [];
  return (data ?? [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean);
}

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

export async function notifyManyCrmUsers(
  admin: SupabaseClient,
  userIds: string[],
  input: Omit<CrmStaffNotificationInput, 'userId'>
): Promise<void> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  for (const userId of unique) {
    await notifyCrmUser(admin, { ...input, userId });
  }
}

function appOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    '';
  if (!raw) return '';
  if (raw.startsWith('http')) return raw.replace(/\/$/, '');
  return `https://${raw}`;
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
  const cta = link
    ? `<p style="margin-top:16px"><a href="${link}" style="color:#0d9488;font-weight:600">Open in BuildCon CRM</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1e293b">
<p style="font-weight:600;margin:0 0 8px">${params.title}</p>
<p style="margin:0;line-height:1.5">${params.body}</p>
${cta}
</div>`;
}
