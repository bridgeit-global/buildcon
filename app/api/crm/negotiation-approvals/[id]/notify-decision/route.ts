import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/authz';
import { inquiryReference } from '@/app/crm/inquiry/inquiry-helpers';
import {
  notifyCrmUser,
  staffNotificationEmailHtml
} from '@/lib/notifications/crm-staff-notification';

type Body = {
  decision: 'approved' | 'rejected';
  decisionNote?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: approvalId } = await params;
  const gate = await requireSuperAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body = { decision: 'approved' };
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('negotiation_approvals')
    .select(
      'id, sales_inquiry_id, project_id, offered_price, discount_pct, status, requested_by, decision_note'
    )
    .eq('id', approvalId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
  }

  const requestedBy = String(row.requested_by ?? '').trim();
  if (!requestedBy) {
    return NextResponse.json({ ok: true, skipped: 'no_requester' });
  }

  const inquiryId = String(row.sales_inquiry_id);
  const ref = inquiryReference(inquiryId);
  const linkPath = `/crm/inquiry/new?inquiry=${encodeURIComponent(inquiryId)}`;
  const approved = body.decision === 'approved';
  const title = approved
    ? 'Budget approval approved'
    : 'Budget approval rejected';
  const note = String(body.decisionNote ?? row.decision_note ?? '').trim();
  const bodyText = approved
    ? `${ref} — your discount request was approved. You can create a booking from the enquiry.`
    : `${ref} — your discount request was rejected.${note ? ` Note: ${note}` : ''}`;
  const emailHtml = staffNotificationEmailHtml({
    title,
    body: bodyText,
    linkPath
  });

  await notifyCrmUser(admin, {
    userId: requestedBy,
    projectId: String(row.project_id || ''),
    kind: approved
      ? 'negotiation_approval_approved'
      : 'negotiation_approval_rejected',
    title,
    body: bodyText,
    linkPath,
    emailSubject: `[BuildCon] ${title}`,
    emailHtml
  });

  return NextResponse.json({ ok: true });
}
