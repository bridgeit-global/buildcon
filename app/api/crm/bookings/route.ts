import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { resolveCoBuyers } from '@/lib/booking/co-buyers';
import { insertDefaultPaymentSchedule } from '@/lib/booking/booking-schedule';
import { isUnitBookableForWorkflow } from '@/app/crm/inventory/unit-status';
import {
  isTokenStageComplete,
  mergeStageData
} from '@/app/crm/bookings/booking-stage-transitions';
import type { BookingStageData } from '@/app/crm/bookings/booking-types';
import { INQUIRY_ACTIVE_BOOKING_MESSAGE } from '@/app/crm/inquiry/inquiry-booking-guard';
import { negotiationApprovalBlockMessage } from '@/app/crm/inquiry/inquiry-stage-transitions';
import { enrichNegotiationFromApprovals } from '@/app/crm/inquiry/inquiry-stage-store';
import type { InquiryStageData } from '@/app/crm/inquiry/inquiry-types';

type PaymentDetailPayload = {
  utr?: string;
  cheque_number?: string;
  neft_ref?: string;
};

type CreateBookingBody = {
  projectId: string;
  unitId: string;
  customerId: string;
  salesInquiryId?: string | null;
  coBuyerCustomerIds?: string[];
  coBuyerRelationships?: Record<string, string>;
  paymentMode: string;
  loanBank?: string | null;
  paymentDetail?: PaymentDetailPayload | null;
  bookingAmount?: number | null;
  tokenDate?: string | null;
  /** Final unit sale price (negotiated or catalog incl. GST) for payment schedule. */
  saleTotalInr?: number | null;
  /** When true, completes workflow in one step (legacy create form). */
  confirmImmediately?: boolean;
};

function normalizePaymentDetail(
  raw: PaymentDetailPayload | null | undefined
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  const utr = typeof raw.utr === 'string' ? raw.utr.trim() : '';
  if (utr) out.utr = utr;
  const cq = typeof raw.cheque_number === 'string' ? raw.cheque_number.trim() : '';
  if (cq) out.cheque_number = cq;
  const neft = typeof raw.neft_ref === 'string' ? raw.neft_ref.trim() : '';
  if (neft) out.neft_ref = neft;
  return out;
}

function normalizePhone(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateBookingBody;
  if (!body?.projectId || !body?.unitId || !body?.customerId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const gate = await requireProjectAccess(body.projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const modeTrim = String(body.paymentMode || '').trim();
  const paymentDetailObj = normalizePaymentDetail(body.paymentDetail ?? null);
  if (modeTrim === 'UPI' && !paymentDetailObj.utr) {
    return NextResponse.json({ error: 'Enter UPI UTR' }, { status: 400 });
  }
  if (modeTrim === 'Cheque' && !paymentDetailObj.cheque_number) {
    return NextResponse.json({ error: 'Enter cheque number' }, { status: 400 });
  }
  if (modeTrim === 'NEFT/RTGS' && !paymentDetailObj.neft_ref) {
    return NextResponse.json({ error: 'Enter NEFT / RTGS reference' }, { status: 400 });
  }

  const rawCoIds = Array.isArray(body.coBuyerCustomerIds) ? body.coBuyerCustomerIds : [];
  const coBuyerIdsOrdered: string[] = [];
  const seen = new Set<string>();
  for (const id of rawCoIds) {
    if (typeof id !== 'string' || !id.trim()) continue;
    if (id === body.customerId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    coBuyerIdsOrdered.push(id);
  }

  const admin = createSupabaseAdminClient();

  const { data: primaryCust, error: primaryErr } = await admin
    .from('customers')
    .select('id,full_name,phone')
    .eq('id', body.customerId)
    .maybeSingle();
  if (primaryErr) {
    return NextResponse.json({ error: primaryErr.message }, { status: 500 });
  }
  if (!primaryCust) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  if (!String(primaryCust.full_name ?? '').trim()) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  }
  const primaryPhoneDigits = normalizePhone(primaryCust.phone as string | null);
  if (primaryPhoneDigits.length !== 10) {
    return NextResponse.json(
      { error: 'Customer phone number must be 10 digits' },
      { status: 400 }
    );
  }

  const coResolved = await resolveCoBuyers(
    admin,
    body.customerId,
    primaryPhoneDigits,
    coBuyerIdsOrdered,
    body.coBuyerRelationships
  );
  if (coResolved.error) {
    return NextResponse.json({ error: coResolved.error }, { status: 400 });
  }

  const { data: unitRow, error: unitSelErr } = await admin
    .from('units')
    .select('id,status')
    .eq('id', body.unitId)
    .eq('project_id', body.projectId)
    .maybeSingle();
  if (unitSelErr) {
    return NextResponse.json({ error: unitSelErr.message }, { status: 500 });
  }
  if (!unitRow) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }
  if (!isUnitBookableForWorkflow(unitRow.status as string)) {
    return NextResponse.json({ error: 'Unit is not available for booking' }, { status: 409 });
  }

  const salesInquiryId = body.salesInquiryId?.trim() || null;
  if (salesInquiryId) {
    const { data: existingBooking, error: dupErr } = await admin
      .from('bookings')
      .select('id')
      .eq('sales_inquiry_id', salesInquiryId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }
    if (existingBooking?.id) {
      return NextResponse.json(
        {
          error: INQUIRY_ACTIVE_BOOKING_MESSAGE,
          bookingId: existingBooking.id as string
        },
        { status: 409 }
      );
    }

    const { data: inqRow, error: inqErr } = await admin
      .from('sales_inquiries')
      .select('funnel_stage, stage_data')
      .eq('id', salesInquiryId)
      .eq('project_id', body.projectId)
      .maybeSingle();
    if (inqErr) {
      return NextResponse.json({ error: inqErr.message }, { status: 500 });
    }
    if (!inqRow) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }
    const baseStage =
      inqRow.stage_data &&
      typeof inqRow.stage_data === 'object' &&
      !Array.isArray(inqRow.stage_data)
        ? (inqRow.stage_data as InquiryStageData)
        : ({} as InquiryStageData);
    const enriched = await enrichNegotiationFromApprovals(
      admin,
      salesInquiryId,
      baseStage
    );
    const blockMsg = negotiationApprovalBlockMessage(enriched.negotiation, {
      funnelStage: String(inqRow.funnel_stage ?? '')
    });
    if (blockMsg) {
      return NextResponse.json({ error: blockMsg }, { status: 403 });
    }
  }

  const confirmNow = Boolean(body.confirmImmediately);
  const bookingAmount = Number(body.bookingAmount || 0);
  const tokenDate =
    String(body.tokenDate ?? '').trim() || new Date().toISOString().slice(0, 10);

  const stageData: BookingStageData = mergeStageData(null, 'token', {
    amount: bookingAmount ? String(bookingAmount) : '',
    date: tokenDate,
    mode: modeTrim,
    reference:
      paymentDetailObj.utr ||
      paymentDetailObj.cheque_number ||
      paymentDetailObj.neft_ref ||
      '',
    recorded_at: new Date().toISOString()
  });

  const tokenRecorded = isTokenStageComplete(stageData);
  /** Record token & continue: stay on token until user advances on the booking detail page. */
  const initialWorkflowStage = confirmNow ? 'confirmation' : 'token';

  const unitStatusBefore = String(unitRow.status || '').trim().toUpperCase();
  const lockStatus = confirmNow ? 'BOOKED' : 'TOKEN';

  const { error: unitUpdErr } = await admin
    .from('units')
    .update({ status: lockStatus })
    .eq('id', body.unitId)
    .in('status', ['AVAILABLE', 'TOKEN', 'A', 'BLOCKED', 'BL']);
  if (unitUpdErr) {
    return NextResponse.json({ error: unitUpdErr.message }, { status: 500 });
  }

  const { data: bookingRow, error: bookingErr } = await admin
    .from('bookings')
    .insert({
      project_id: body.projectId,
      unit_id: body.unitId,
      customer_id: body.customerId,
      sales_inquiry_id: body.salesInquiryId?.trim() || null,
      co_buyers: coResolved.coBuyers,
      workflow_stage: initialWorkflowStage,
      stage: 'booking',
      stage_data: stageData,
      status: 'active',
      payment_mode: body.paymentMode,
      loan_bank: body.loanBank ?? null,
      booking_amount: body.bookingAmount ?? null,
      payment_detail: paymentDetailObj,
      created_by: gate.userId,
      updated_at: new Date().toISOString()
    })
    .select('id,workflow_stage')
    .single();

  if (bookingErr) {
    await admin
      .from('units')
      .update({ status: unitStatusBefore })
      .eq('id', body.unitId);
    return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  }

  const bookingId = bookingRow.id as string;

  if (salesInquiryId) {
    await admin
      .from('sales_inquiries')
      .update({
        funnel_stage: 'Token',
        updated_at: new Date().toISOString()
      })
      .eq('id', salesInquiryId);
  }

  const shouldSeedSchedule = confirmNow || tokenRecorded;
  if (shouldSeedSchedule) {
    try {
      await insertDefaultPaymentSchedule(admin, bookingId, {
        projectId: body.projectId,
        unitId: body.unitId,
        bookingAmount,
        salesInquiryId: body.salesInquiryId?.trim() || null,
        stageData: stageData as Record<string, unknown>,
        saleTotalInr:
          body.saleTotalInr != null && body.saleTotalInr > 0
            ? body.saleTotalInr
            : null
      });
    } catch (e) {
      await admin.from('bookings').delete().eq('id', bookingId);
      await admin
        .from('units')
        .update({ status: unitStatusBefore })
        .eq('id', body.unitId);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to create schedule' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    bookingId,
    workflowStage: bookingRow.workflow_stage,
    redirectTo: confirmNow ? null : `/crm/bookings/${bookingId}`
  });
}
