import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  resolveBookingAmountInr,
  syncBookingPaymentScheduleToSaleTotal
} from '@/lib/booking/booking-schedule';
import {
  canAdvanceWorkflowStage,
  isTokenStageLocked,
  mergeStageData,
  nextWorkflowStage
} from '@/app/crm/bookings/booking-stage-transitions';
import type { BookingStageData, BookingWorkflowStage } from '@/app/crm/bookings/booking-types';

type StageBody = {
  action: 'advance' | 'save';
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
      'id,project_id,unit_id,sales_inquiry_id,workflow_stage,stage,stage_data,status,booking_amount,payment_detail'
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

  if (body.action === 'save') {
    const bookingPatch: {
      stage_data: BookingStageData;
      updated_at: string;
      booking_amount?: number;
    } = {
      stage_data: stageData,
      updated_at: new Date().toISOString()
    };
    if (resolvedBookingAmount > 0) {
      bookingPatch.booking_amount = resolvedBookingAmount;
    }
    const { error } = await admin
      .from('bookings')
      .update(bookingPatch)
      .eq('id', bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, workflowStage: current });
  }

  const check = canAdvanceWorkflowStage(current, stageData);
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

  return NextResponse.json({ ok: true, workflowStage: next });
}
