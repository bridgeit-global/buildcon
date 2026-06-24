import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  insertDefaultPaymentSchedule,
  ensureTokenCollectionForBooking
} from '@/lib/booking/booking-schedule';
import { isUnitBookableForWorkflow } from '@/app/crm/inventory/unit-status';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import { generatedReceiptExistsForCollection } from '@/lib/booking/booking-generated-doc-kind';
import { isInquiryTokenComplete } from '@/app/crm/inquiry/inquiry-token-stage';
import type { InquiryStageData } from '@/app/crm/inquiry/inquiry-types';
import type { BookingStageData } from '@/app/crm/bookings/booking-types';
import { bookingAmountExceedsUnitTotalMessage } from '@/lib/booking/booking-amount-cap';
import { normalizeBookingPaymentMode } from '@/lib/booking/booking-payment';

export const runtime = 'nodejs';
export const maxDuration = 60;
import { resolveSaleTotalInrForBooking } from '@/lib/booking/resolve-sale-total';

type Body = { saleTotalInr?: number | null };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inquiryId } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const admin = createSupabaseAdminClient();

  const { data: inquiry, error: inqErr } = await admin
    .from('sales_inquiries')
    .select('id, project_id, customer_id, unit_id, funnel_stage, stage_data')
    .eq('id', inquiryId)
    .maybeSingle();

  if (inqErr) {
    return NextResponse.json({ error: inqErr.message }, { status: 500 });
  }
  if (!inquiry) {
    return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
  }

  const projectId = (inquiry.project_id as string | null) ?? '';
  const unitId = (inquiry.unit_id as string | null) ?? '';
  const customerId = (inquiry.customer_id as string | null) ?? '';

  if (!projectId || !unitId || !customerId) {
    return NextResponse.json(
      {
        error:
          'Inquiry is missing project / unit / customer. Complete the qualification stage before recording the token.'
      },
      { status: 409 }
    );
  }

  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: existingBooking } = await admin
    .from('bookings')
    .select('id, workflow_stage')
    .eq('sales_inquiry_id', inquiryId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (existingBooking?.id) {
    return NextResponse.json({
      ok: true,
      bookingId: existingBooking.id,
      workflowStage: existingBooking.workflow_stage,
      created: false,
      message: 'Booking already exists for this inquiry.'
    });
  }

  // Load token stage payload from sales_inquiry_stages (source of truth).
  const { data: tokenStageRow, error: stErr } = await admin
    .from('sales_inquiry_stages')
    .select('payload')
    .eq('sales_inquiry_id', inquiryId)
    .eq('stage', 'Token')
    .maybeSingle();
  if (stErr) {
    return NextResponse.json({ error: stErr.message }, { status: 500 });
  }

  const inquiryStageData = (inquiry.stage_data ?? {}) as InquiryStageData;
  const tokenPayload =
    (tokenStageRow?.payload as Record<string, unknown> | null) ??
    (inquiryStageData.token as Record<string, unknown> | null | undefined) ??
    null;

  if (!isInquiryTokenComplete({ token: tokenPayload ?? undefined } as InquiryStageData)) {
    return NextResponse.json(
      { error: 'Enter token amount, date, and payment mode before creating the booking.' },
      { status: 409 }
    );
  }

  const tokenAmount = Number(
    String((tokenPayload as { amount?: string }).amount ?? '').trim() || 0
  );
  const tokenDate = String((tokenPayload as { date?: string }).date ?? '').trim();
  const tokenMode = String((tokenPayload as { mode?: string }).mode ?? '').trim();
  const tokenReference =
    String((tokenPayload as { reference?: string }).reference ?? '').trim() || null;

  // Verify unit availability.
  const { data: unitRow, error: unitErr } = await admin
    .from('units')
    .select('id,status,project_id')
    .eq('id', unitId)
    .maybeSingle();
  if (unitErr) {
    return NextResponse.json({ error: unitErr.message }, { status: 500 });
  }
  if (!unitRow) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }
  if (unitRow.project_id !== projectId) {
    return NextResponse.json(
      { error: 'Unit does not belong to this inquiry project.' },
      { status: 409 }
    );
  }
  if (!isUnitBookableForWorkflow(unitRow.status as string)) {
    return NextResponse.json(
      { error: 'Unit is not available — another booking may have claimed it.' },
      { status: 409 }
    );
  }

  const saleTotalInr = await resolveSaleTotalInrForBooking(admin, {
    unitId,
    projectId,
    salesInquiryId: inquiryId,
    saleTotalInr: body.saleTotalInr
  });
  const tokenAmountCapMsg = bookingAmountExceedsUnitTotalMessage(
    tokenAmount,
    saleTotalInr
  );
  if (tokenAmountCapMsg) {
    return NextResponse.json({ error: tokenAmountCapMsg }, { status: 400 });
  }

  // Verify customer is on file.
  const { data: customer } = await admin
    .from('customers')
    .select('id, full_name, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const unitStatusBefore = String(unitRow.status || '').trim().toUpperCase();

  const stageData: BookingStageData = {
    token: {
      amount: tokenAmount ? String(tokenAmount) : '',
      date: tokenDate,
      mode: tokenMode,
      reference: tokenReference ?? '',
      recorded_at:
        String((tokenPayload as { recorded_at?: string }).recorded_at ?? '').trim() ||
        new Date().toISOString()
    }
  };

  // Lock unit to TOKEN (only if not already advanced).
  const { error: unitUpdErr } = await admin
    .from('units')
    .update({ status: 'TOKEN' })
    .eq('id', unitId)
    .in('status', ['AVAILABLE', 'BLOCKED', 'TOKEN', 'A']);
  if (unitUpdErr) {
    return NextResponse.json({ error: unitUpdErr.message }, { status: 500 });
  }

  const paymentMode = normalizeBookingPaymentMode(tokenMode);

  const { data: bookingRow, error: bookingErr } = await admin
    .from('bookings')
    .insert({
      project_id: projectId,
      unit_id: unitId,
      customer_id: customerId,
      sales_inquiry_id: inquiryId,
      co_buyers: [],
      workflow_stage: 'token',
      stage: 'booking',
      stage_data: stageData,
      status: 'active',
      payment_mode: paymentMode,
      booking_amount: tokenAmount || null,
      payment_detail: tokenReference ? buildPaymentDetail(tokenMode, tokenReference) : {},
      created_by: gate.userId,
      updated_at: new Date().toISOString()
    })
    .select('id, workflow_stage')
    .single();

  if (bookingErr) {
    await admin.from('units').update({ status: unitStatusBefore }).eq('id', unitId);
    return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  }

  const bookingId = bookingRow.id as string;

  // Seed payment schedule + token collection on instalment 1.
  try {
    await insertDefaultPaymentSchedule(admin, bookingId, {
      projectId,
      unitId,
      bookingAmount: tokenAmount,
      salesInquiryId: inquiryId,
      stageData: stageData as unknown as Record<string, unknown>,
      saleTotalInr:
        body.saleTotalInr != null && body.saleTotalInr > 0 ? body.saleTotalInr : null
    });
    await ensureTokenCollectionForBooking(admin, bookingId, {
      stageData: stageData as unknown as Record<string, unknown>,
      bookingAmount: tokenAmount,
      paymentMode,
      createdBy: gate.userId
    });
  } catch (e) {
    await admin.from('bookings').delete().eq('id', bookingId);
    await admin.from('units').update({ status: unitStatusBefore }).eq('id', unitId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create payment schedule' },
      { status: 500 }
    );
  }

  // Generate token receipt PDF (notification is sent manually via Documents > Send).
  let tokenReceiptId: string | null = null;
  try {
    const packRes = await loadBookingPrintPack(admin, bookingId);
    if (packRes.ok) {
      const { data: schedule } = await admin
        .from('payment_schedules')
        .select('id, instalment_no, milestone')
        .eq('booking_id', bookingId)
        .eq('instalment_no', 1)
        .maybeSingle();
      const scheduleId = schedule?.id as string | undefined;
      let collectionId: string | null = null;
      if (scheduleId) {
        const { data: col } = await admin
          .from('collections')
          .select('id, received_amount, received_at, mode, reference')
          .eq('booking_id', bookingId)
          .eq('schedule_id', scheduleId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        collectionId = (col?.id as string | undefined) ?? null;

        const { data: existing } = await admin
          .from('generated_documents')
          .select('storage_path')
          .eq('booking_id', bookingId)
          .limit(200);
        const alreadyGenerated =
          collectionId &&
          generatedReceiptExistsForCollection(
            (existing ?? []) as { storage_path: string }[],
            collectionId
          );

        if (collectionId && col && !alreadyGenerated) {
          const persisted = await persistGeneratedBookingDocumentServer(
            admin,
            packRes.pack,
            'receipt',
            {
              linkId: collectionId,
              generatedBy: gate.userId,
              htmlOverrides: {
                receivedAmount: Number(col.received_amount || tokenAmount),
                receivedAt: (col.received_at as string | null) ?? tokenDate,
                paymentMode: (col.mode as string | null) ?? tokenMode,
                paymentReference: (col.reference as string | null) ?? tokenReference,
                instalmentLabel: schedule
                  ? `${schedule.instalment_no}. ${schedule.milestone}`
                  : 'Booking Amount'
              }
            }
          );
          if (persisted.ok) {
            tokenReceiptId = persisted.id;
          }
        }
      }
    }
  } catch {
    // Token receipt generation is best-effort; booking has already been created.
  }

  return NextResponse.json({
    ok: true,
    bookingId,
    workflowStage: bookingRow.workflow_stage,
    created: true,
    tokenReceiptId
  });
}

function buildPaymentDetail(
  mode: string | null | undefined,
  reference: string
): Record<string, string> {
  const m = String(mode ?? '').trim();
  if (m === 'UPI') return { utr: reference };
  if (m === 'Cheque') return { cheque_number: reference };
  if (m === 'NEFT/RTGS') return { neft_ref: reference };
  return {};
}
