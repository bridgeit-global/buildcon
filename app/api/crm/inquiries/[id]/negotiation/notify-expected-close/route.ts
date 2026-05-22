import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { inquiryReference } from '@/app/crm/inquiry/inquiry-helpers';
import {
  listActiveProjectMemberUserIds,
  notifyManyCrmUsers,
  staffNotificationEmailHtml
} from '@/lib/notifications/crm-staff-notification';
import { formatDisplayDate } from '@/lib/format-display-date';

type Body = {
  expectedClose: string;
  customerName?: string | null;
  unitCode?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inquiryId } = await params;
  let body: Body = { expectedClose: '' };
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const expectedClose = String(body.expectedClose || '').trim();
  if (!expectedClose) {
    return NextResponse.json({ error: 'Expected close date is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: inquiry, error: inqErr } = await admin
    .from('sales_inquiries')
    .select('id, project_id')
    .eq('id', inquiryId)
    .maybeSingle();

  if (inqErr) {
    return NextResponse.json({ error: inqErr.message }, { status: 500 });
  }
  if (!inquiry) {
    return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
  }

  const projectId = String(inquiry.project_id || '').trim();
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const ref = inquiryReference(inquiryId);
  const customer = String(body.customerName || '').trim();
  const unit = String(body.unitCode || '').trim();
  const when = formatDisplayDate(expectedClose);
  const linkPath = `/crm/inquiry/new?inquiry=${encodeURIComponent(inquiryId)}`;

  const title = 'Expected closure date set';
  const bodyText = [
    ref,
    customer || null,
    unit ? `Unit ${unit}` : null,
    `Expected close: ${when}`
  ]
    .filter(Boolean)
    .join(' · ');

  const memberIds = await listActiveProjectMemberUserIds(admin, projectId);
  await notifyManyCrmUsers(admin, memberIds, {
    projectId,
    kind: 'inquiry_expected_close',
    title,
    body: bodyText,
    linkPath,
    emailSubject: `[BuildCon] ${title}`,
    emailHtml: staffNotificationEmailHtml({ title, body: bodyText, linkPath })
  });

  return NextResponse.json({ ok: true, notified: memberIds.length });
}
