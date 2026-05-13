import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';

type CoBuyerStored = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type PaymentDetailPayload = {
  utr?: string;
  cheque_number?: string;
  neft_ref?: string;
};

type CreateBookingBody = {
  projectId: string;
  unitId: string;
  customerId: string;
  /** Additional buyer customer IDs (order preserved). */
  coBuyerCustomerIds?: string[];
  paymentMode: string;
  loanBank?: string | null;
  /** Mode-specific refs stored as JSON on the booking row. */
  paymentDetail?: PaymentDetailPayload | null;
  bookingAmount?: number | null;
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

  const rawCoIds = Array.isArray(body.coBuyerCustomerIds)
    ? body.coBuyerCustomerIds
    : [];
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

  let coBuyersPayload: CoBuyerStored[] = [];
  if (coBuyerIdsOrdered.length > 0) {
    const { data: primaryCust, error: pcErr } = await admin
      .from('customers')
      .select('id,phone')
      .eq('id', body.customerId)
      .maybeSingle();
    if (pcErr) {
      return NextResponse.json({ error: pcErr.message }, { status: 500 });
    }
    if (!primaryCust) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    const primaryPhone = normalizePhone(primaryCust.phone as string | null);

    const { data: coRows, error: coErr } = await admin
      .from('customers')
      .select('id,full_name,phone,email')
      .in('id', coBuyerIdsOrdered);
    if (coErr) {
      return NextResponse.json({ error: coErr.message }, { status: 500 });
    }
    if (!coRows || coRows.length !== coBuyerIdsOrdered.length) {
      return NextResponse.json(
        { error: 'One or more co-buyer customers were not found' },
        { status: 400 }
      );
    }
    const byId = new Map(
      coRows.map((r) => [
        r.id as string,
        r as {
          id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
        }
      ])
    );
    const usedCoPhones = new Set<string>();
    for (const id of coBuyerIdsOrdered) {
      const row = byId.get(id);
      if (!row) {
        return NextResponse.json(
          { error: 'One or more co-buyer customers were not found' },
          { status: 400 }
        );
      }
      const p = normalizePhone(row.phone);
      if (p && primaryPhone && p === primaryPhone) {
        return NextResponse.json(
          { error: 'A co-buyer cannot use the same phone number as the primary customer' },
          { status: 400 }
        );
      }
      if (p) {
        if (usedCoPhones.has(p)) {
          return NextResponse.json(
            { error: 'Co-buyers cannot share the same phone number' },
            { status: 400 }
          );
        }
        usedCoPhones.add(p);
      }
      coBuyersPayload.push({
        customer_id: row.id,
        full_name: row.full_name,
        phone: row.phone,
        email: row.email
      });
    }
  }

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
      co_buyers: coBuyersPayload,
      stage: 'booking',
      payment_mode: body.paymentMode,
      loan_bank: body.loanBank ?? null,
      booking_amount: body.bookingAmount ?? null,
      payment_detail: paymentDetailObj,
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

