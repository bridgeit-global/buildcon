import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  resolveBookingAmountInr,
  syncBookingPaymentScheduleToSaleTotal
} from '@/lib/booking/booking-schedule';
import { seedConfirmationDocuments } from '@/lib/booking/seed-confirmation-documents';
import {
  canAdvanceWorkflowStage,
  isTokenStageLocked,
  mergeStageData,
  nextWorkflowStage,
  previousWorkflowStage
} from '@/app/crm/bookings/booking-stage-transitions';
import type { BookingStageData, BookingWorkflowStage } from '@/app/crm/bookings/booking-types';
import { loadBookingKycReport } from '@/lib/customer/server-kyc-loader';
import { bookingAmountExceedsUnitTotalMessage } from '@/lib/booking/booking-amount-cap';
import { createBookingTokenStageSchema } from '@/lib/booking/booking-workflow.schema';
import { resolveSaleTotalInrForBooking } from '@/lib/booking/resolve-sale-total';

type StageBody = {
  action: 'advance' | 'save' | 'revert';
  stageDataPatch?: Record<string, unknown>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const body = (await request.json()) as StageBody;
  const admin = createSupabaseAdminClient();

  const { data: booking, error: loadErr } = await admin
    .from('bookings')
    .select(
      'id,project_id,unit_id,sales_inquiry_id,workflow_stage,stage,stage_data,status,booking_amount,payment_detail,loan_bank'
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking is cancelled' }, { status: 409 });
  }

  const gate = await requireProjectAccess(booking.project_id as string);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const current = booking.workflow_stage as BookingWorkflowStage;
  let stageData = (booking.stage_data ?? {}) as BookingStageData;
  const tokenLocked = isTokenStageLocked(stageData, current);

  if (current === 'token' && tokenLocked && body.action === 'save') {
    return NextResponse.json(
      { error: 'Token details cannot be changed after recording or confirmation.' },
      { status: 409 }
    );
  }

  if (
    body.stageDataPatch &&
    typeof body.stageDataPatch === 'object' &&
    !(current === 'token' && tokenLocked)
  ) {
    if (current === 'token') {
      const token = stageData.token ?? {};
      const tokenParsed = createBookingTokenStageSchema({
        loanBank: booking.loan_bank as string | null
      }).safeParse({
        amount: String(body.stageDataPatch.amount ?? token.amount ?? ''),
        date: String(body.stageDataPatch.date ?? token.date ?? ''),
        mode: String(body.stageDataPatch.mode ?? token.mode ?? '')
      });
      if (!tokenParsed.success) {
        return NextResponse.json(
          { error: tokenParsed.error.issues[0]?.message ?? 'Complete token details.' },
          { status: 400 }
        );
      }
    }
    stageData = mergeStageData(stageData, current, body.stageDataPatch);
  }

  if (body.action === 'save' && current === 'token' && !tokenLocked) {
    stageData = mergeStageData(stageData, 'token', {
      recorded_at: stageData.token?.recorded_at ?? new Date().toISOString()
    });
  }

  const resolvedBookingAmount = resolveBookingAmountInr({
    bookingAmount: booking.booking_amount as number | null,
    stageData: stageData as Record<string, unknown>
  });

  let resolvedSaleTotalInr: number | null = null;
  if (body.action === 'save' && current === 'token' && resolvedBookingAmount > 0) {
    const saleTotalInr = await resolveSaleTotalInrForBooking(admin, {
      unitId: booking.unit_id as string,
      projectId: booking.project_id as string,
      salesInquiryId: (booking.sales_inquiry_id as string | null) ?? null
    });
    resolvedSaleTotalInr = saleTotalInr;
    const capMsg = bookingAmountExceedsUnitTotalMessage(
      resolvedBookingAmount,
      saleTotalInr
    );
    if (capMsg) {
      return NextResponse.json({ error: capMsg }, { status: 400 });
    }
  }

  if (body.action === 'save') {
    const bookingPatch: {
      stage_data: BookingStageData;
      updated_at: string;
      booking_amount?: number;
      sale_total_inr?: number;
    } = {
      stage_data: stageData,
      updated_at: new Date().toISOString()
    };
    if (resolvedBookingAmount > 0) {
      bookingPatch.booking_amount = resolvedBookingAmount;
    }
    if (resolvedSaleTotalInr != null && resolvedSaleTotalInr > 0) {
      bookingPatch.sale_total_inr = resolvedSaleTotalInr;
    }
    const { error } = await admin
      .from('bookings')
      .update(bookingPatch)
      .eq('id', bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, workflowStage: current });
  }

  if (body.action === 'revert') {
    const prev = previousWorkflowStage(current);
    if (!prev) {
      return NextResponse.json(
        { error: 'Already at the first stage.' },
        { status: 400 }
      );
    }
    const { error: revertErr } = await admin
      .from('bookings')
      .update({
        workflow_stage: prev,
        stage_data: stageData,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);
    if (revertErr) {
      return NextResponse.json({ error: revertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, workflowStage: prev });
  }

  if (current === 'application') {
    const kycRes = await loadBookingKycReport(admin, bookingId);
    if (!kycRes.ok) {
      return NextResponse.json({ error: kycRes.error }, { status: 500 });
    }
    if (!kycRes.report.kycComplete) {
      return NextResponse.json(
        {
          error: 'Upload PAN and Aadhaar for the primary buyer and each co-applicant.',
          missing: kycRes.report.missing
        },
        { status: 409 }
      );
    }
  }

  const check = canAdvanceWorkflowStage(current, stageData, {
    kycComplete: current === 'application' ? true : undefined
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  if (current === 'token') {
    stageData = mergeStageData(stageData, 'token', {
      recorded_at: stageData.token?.recorded_at ?? new Date().toISOString()
    });
  }

  const next = nextWorkflowStage(current);
  if (!next) {
    return NextResponse.json({ error: 'Already at final stage' }, { status: 400 });
  }

  if (next === 'confirmation') {
    try {
      await syncBookingPaymentScheduleToSaleTotal(admin, bookingId, {
        stageData: stageData as Record<string, unknown>,
        bookingAmount: resolvedBookingAmount,
        createdBy: gate.userId
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Schedule sync failed' },
        { status: 500 }
      );
    }

    const { error: unitErr } = await admin
      .from('units')
      .update({ status: 'BOOKED' })
      .eq('id', booking.unit_id as string);
    if (unitErr) {
      return NextResponse.json({ error: unitErr.message }, { status: 500 });
    }

    stageData = mergeStageData(stageData, 'confirmation', {
      confirmed_at: new Date().toISOString(),
      confirmed_by: gate.userId
    });
  }

  const advancePatch: {
    workflow_stage: BookingWorkflowStage;
    stage_data: BookingStageData;
    stage: string;
    updated_at: string;
    booking_amount?: number;
  } = {
    workflow_stage: next,
    stage_data: stageData,
    stage: next === 'confirmation' ? 'booking' : (booking.stage as string),
    updated_at: new Date().toISOString()
  };
  if (resolvedBookingAmount > 0) {
    advancePatch.booking_amount = resolvedBookingAmount;
  }

  const { error: updErr } = await admin
    .from('bookings')
    .update(advancePatch)
    .eq('id', bookingId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  let confirmationDocs: {
    tokenReceiptCreated?: boolean;
    tokenReceiptSkipped?: boolean;
    seedError?: string;
  } | undefined;

  if (next === 'confirmation') {
    const seed = await seedConfirmationDocuments(admin, bookingId, {
      generatedBy: gate.userId
    });
    confirmationDocs = {
      tokenReceiptCreated: seed.tokenReceiptCreated,
      tokenReceiptSkipped: seed.tokenReceiptSkipped,
      seedError: seed.error
    };
  }

  return NextResponse.json({ ok: true, workflowStage: next, confirmationDocs });
}
