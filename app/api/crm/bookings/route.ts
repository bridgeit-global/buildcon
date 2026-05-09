import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';

type CreateBookingBody = {
  projectId: string;
  unitId: string;
  customerId: string;
  paymentMode: string;
  loanBank?: string | null;
  bookingAmount?: number | null;
};

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

  const admin = createSupabaseAdminClient();

  // Ensure unit is available, then mark booked.
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
  if (unitRow.status !== 'A') {
    return NextResponse.json(
      { error: 'Unit is not available' },
      { status: 409 }
    );
  }

  const { error: unitUpdErr } = await admin
    .from('units')
    .update({ status: 'B' })
    .eq('id', body.unitId)
    .eq('status', 'A');
  if (unitUpdErr) {
    return NextResponse.json({ error: unitUpdErr.message }, { status: 500 });
  }

  const { data: bookingRow, error: bookingErr } = await admin
    .from('bookings')
    .insert({
      project_id: body.projectId,
      unit_id: body.unitId,
      customer_id: body.customerId,
      stage: 'booking',
      payment_mode: body.paymentMode,
      loan_bank: body.loanBank ?? null,
      booking_amount: body.bookingAmount ?? null,
      created_by: gate.userId
    })
    .select('id')
    .single();

  if (bookingErr) {
    // Best-effort rollback unit to available
    await admin.from('units').update({ status: 'A' }).eq('id', body.unitId);
    return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  }

  const bookingId = bookingRow.id as string;
  const bookingAmount = Number(body.bookingAmount || 0);

  const scheduleRows = [
    {
      booking_id: bookingId,
      instalment_no: 1,
      milestone: 'Booking Amount',
      due_date: addDaysISO(0),
      amount: bookingAmount
    },
    {
      booking_id: bookingId,
      instalment_no: 2,
      milestone: 'Allotment',
      due_date: addDaysISO(30),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 3,
      milestone: 'Plinth Completed',
      due_date: addDaysISO(60),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 4,
      milestone: '1st Slab Completed',
      due_date: addDaysISO(90),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 5,
      milestone: '3rd Slab Completed',
      due_date: addDaysISO(120),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 6,
      milestone: 'Brickwork Completed',
      due_date: addDaysISO(150),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 7,
      milestone: 'Possession',
      due_date: addDaysISO(180),
      amount: 0
    }
  ];

  const { error: scheduleErr } = await admin
    .from('payment_schedules')
    .insert(scheduleRows);

  if (scheduleErr) {
    return NextResponse.json({ error: scheduleErr.message }, { status: 500 });
  }

  return NextResponse.json({ bookingId });
}

