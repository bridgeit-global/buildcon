import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { syncBookingPaymentScheduleToSaleTotal } from '@/lib/booking/booking-schedule';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: booking, error: loadErr } = await admin
    .from('bookings')
    .select('id,project_id,status')
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

  try {
    const result = await syncBookingPaymentScheduleToSaleTotal(admin, bookingId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
