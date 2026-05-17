import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { calculateBookingRefund } from '@/lib/booking/refund-policy';
import { sumCollectionsForBooking } from '@/lib/booking/booking-schedule';

type CancelBody = {
  reason: string;
  notes?: string;
  deductionPct?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const body = (await request.json()) as CancelBody;
  const reason = String(body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: booking, error: loadErr } = await admin
    .from('bookings')
    .select('id,project_id,unit_id,status,workflow_stage')
    .eq('id', bookingId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 409 });
  }

  const gate = await requireProjectAccess(booking.project_id as string);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let totalCollected = 0;
  try {
    totalCollected = await sumCollectionsForBooking(admin, bookingId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load collections' },
      { status: 500 }
    );
  }

  const refund = calculateBookingRefund({
    totalCollectedInr: totalCollected,
    deductionPct: body.deductionPct
  });

  const { data: cancellation, error: cancelErr } = await admin
    .from('booking_cancellations')
    .insert({
      booking_id: bookingId,
      project_id: booking.project_id,
      reason,
      notes: body.notes?.trim() || null,
      cancelled_by: gate.userId
    })
    .select('id')
    .single();
  if (cancelErr) {
    return NextResponse.json({ error: cancelErr.message }, { status: 500 });
  }

  const { data: refundRow, error: refundErr } = await admin
    .from('booking_refunds')
    .insert({
      booking_id: bookingId,
      cancellation_id: cancellation.id,
      project_id: booking.project_id,
      total_collected: refund.totalCollectedInr,
      deduction_pct: refund.deductionPct,
      deduction_amount: refund.deductionAmountInr,
      refund_amount: refund.refundAmountInr,
      policy_notes: refund.policyNotes,
      status: 'calculated',
      created_by: gate.userId
    })
    .select('id,refund_amount,deduction_amount,total_collected,policy_notes')
    .single();
  if (refundErr) {
    return NextResponse.json({ error: refundErr.message }, { status: 500 });
  }

  await admin
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId);

  await admin
    .from('units')
    .update({ status: 'AVAILABLE' })
    .eq('id', booking.unit_id as string);

  return NextResponse.json({
    ok: true,
    cancellationId: cancellation.id,
    refund: refundRow
  });
}
