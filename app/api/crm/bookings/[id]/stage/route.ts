import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { insertDefaultPaymentSchedule } from '@/lib/booking/booking-schedule';
import {
  canAdvanceWorkflowStage,
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
      'id,project_id,unit_id,workflow_stage,stage,stage_data,status,booking_amount,payment_detail'
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

  if (body.stageDataPatch && typeof body.stageDataPatch === 'object') {
    stageData = mergeStageData(stageData, current, body.stageDataPatch);
  }

  if (body.action === 'save') {
    const { error } = await admin
      .from('bookings')
      .update({ stage_data: stageData, updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, workflowStage: current });
  }

  const check = canAdvanceWorkflowStage(current, stageData);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  const next = nextWorkflowStage(current);
  if (!next) {
    return NextResponse.json({ error: 'Already at final stage' }, { status: 400 });
  }

  if (next === 'confirmation') {
    const { count } = await admin
      .from('payment_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId);
    if (!count) {
      try {
        await insertDefaultPaymentSchedule(admin, bookingId, {
          projectId: booking.project_id as string,
          unitId: booking.unit_id as string,
          bookingAmount: Number(booking.booking_amount || 0)
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Schedule failed' },
          { status: 500 }
        );
      }
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

  const { error: updErr } = await admin
    .from('bookings')
    .update({
      workflow_stage: next,
      stage_data: stageData,
      stage: next === 'confirmation' ? 'booking' : booking.stage,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workflowStage: next });
}
