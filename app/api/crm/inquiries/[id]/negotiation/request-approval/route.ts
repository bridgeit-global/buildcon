import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  isNegotiationDiscountOverCap,
  MAX_NEGOTIATION_DISCOUNT_PCT,
  resolveNegotiationDiscount
} from '@/lib/inquiry/negotiation-discount';
import { persistNegotiationApprovalRequest } from '@/app/crm/inquiry/inquiry-stage-store';
import {
  listSuperAdminUserIds,
  notifyManyCrmUsers,
  staffNotificationEmailHtml
} from '@/lib/notifications/crm-staff-notification';
import { inquiryReference } from '@/app/crm/inquiry/inquiry-helpers';

type Body = {
  listPriceInr?: number | null;
  discountInr?: string;
  discountPct?: string;
  requestNote?: string;
  unitId?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inquiryId } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: inquiry, error: inqErr } = await admin
    .from('sales_inquiries')
    .select('id, project_id, customer_id, unit_id, funnel_stage')
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

  const listPriceRaw = body.listPriceInr;
  const listPrice =
    listPriceRaw != null && Number.isFinite(Number(listPriceRaw))
      ? Number(listPriceRaw)
      : null;

  const resolved = resolveNegotiationDiscount(listPrice, {
    discountInrRaw: body.discountInr,
    discountPctRaw: body.discountPct
  });

  if (resolved.discountInr == null || resolved.offeredPrice == null) {
    return NextResponse.json(
      { error: 'Enter a discount amount or percentage below list price.' },
      { status: 400 }
    );
  }

  if (
    isNegotiationDiscountOverCap(listPrice, {
      discountInrRaw: body.discountInr,
      discountPctRaw: body.discountPct
    })
  ) {
    return NextResponse.json(
      { error: `Discount cannot exceed ${MAX_NEGOTIATION_DISCOUNT_PCT}%.` },
      { status: 400 }
    );
  }

  const unitId = String(body.unitId ?? inquiry.unit_id ?? '').trim() || null;
  const customerId = String(inquiry.customer_id || '').trim();

  const { data: approvalRow, error: insErr } = await admin
    .from('negotiation_approvals')
    .insert({
      sales_inquiry_id: inquiryId,
      project_id: projectId,
      unit_id: unitId,
      customer_id: customerId || null,
      list_price: listPrice,
      offered_price: resolved.offeredPrice,
      discount_pct: resolved.discountPct,
      request_note: body.requestNote?.trim() || null,
      requested_by: gate.userId
    })
    .select('id')
    .single();

  if (insErr) {
    const msg = insErr.message.includes('negotiation_approvals_one_pending')
      ? 'A pending approval already exists for this enquiry.'
      : insErr.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const approvalId = String(
    (approvalRow as { id?: string } | null)?.id || ''
  );
  const offeredRaw = String(resolved.offeredPrice);

  const persist = await persistNegotiationApprovalRequest(admin, {
    inquiryId,
    approvalId,
    offeredPrice: offeredRaw,
    notes: body.requestNote?.trim() || undefined,
    funnelStage: 'Negotiation',
    negotiationPatch: {
      discount_inr: String(resolved.discountInr),
      discount_pct:
        resolved.discountPct != null ? String(resolved.discountPct) : undefined
    }
  });
  if (!persist.ok) {
    return NextResponse.json(
      { error: persist.error ?? 'Could not save negotiation stage' },
      { status: 500 }
    );
  }

  const ref = inquiryReference(inquiryId);
  const linkPath = `/crm/inquiry/new?inquiry=${encodeURIComponent(inquiryId)}`;
  const discountLabel =
    resolved.discountPct != null
      ? `${resolved.discountPct}% (₹ ${resolved.discountInr?.toLocaleString('en-IN')})`
      : `₹ ${resolved.discountInr?.toLocaleString('en-IN')}`;

  const title = 'Discount approval requested';
  const bodyText = `${ref} — discount ${discountLabel} on offered ₹ ${resolved.offeredPrice.toLocaleString('en-IN')}. Review under CRM → Approvals.`;
  const emailHtml = staffNotificationEmailHtml({
    title,
    body: bodyText,
    linkPath: '/crm/approvals'
  });

  const adminIds = await listSuperAdminUserIds(admin);
  const { inAppCount, emailsSent } = await notifyManyCrmUsers(admin, adminIds, {
    projectId,
    kind: 'negotiation_approval_requested',
    title,
    body: bodyText,
    linkPath: '/crm/approvals',
    emailSubject: `[BuildCon] ${title}`,
    emailHtml
  });

  return NextResponse.json({
    ok: true,
    approvalId,
    offeredPrice: offeredRaw,
    discountInr: resolved.discountInr,
    discountPct: resolved.discountPct,
    notifiedAdmins: adminIds.length,
    inAppNotifications: inAppCount,
    emailsSent
  });
}
