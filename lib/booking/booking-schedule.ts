import type { SupabaseClient } from '@supabase/supabase-js';

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function insertDefaultPaymentSchedule(
  admin: SupabaseClient,
  bookingId: string,
  bookingAmount: number
) {
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

  const { error } = await admin.from('payment_schedules').insert(scheduleRows);
  if (error) throw new Error(error.message);
}

export async function sumCollectionsForBooking(
  admin: SupabaseClient,
  bookingId: string
): Promise<number> {
  const { data, error } = await admin
    .from('collections')
    .select('received_amount')
    .eq('booking_id', bookingId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.received_amount ?? 0),
    0
  );
}
