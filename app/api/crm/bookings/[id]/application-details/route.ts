import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { normalizeAadhaar, normalizePan } from '@/lib/customer/kyc-identifiers';

type ApplicationDetailsBody = {
  customerId: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  occupation: string | null;
  nationality: string | null;
  guardian_name: string | null;
  residential_status: string | null;
  passport_number: string | null;
  office_name_address: string | null;
  pan_number: string | null;
  aadhaar_last4: string | null;
  permanent_address: {
    address_line1: string | null;
    city: string | null;
    state: string | null;
    pin: string | null;
  } | null;
  communication_address: {
    address_line1: string | null;
    city: string | null;
    state: string | null;
    pin: string | null;
  } | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const body = (await request.json()) as ApplicationDetailsBody;
  const admin = createSupabaseAdminClient();

  const { data: booking, error: loadErr } = await admin
    .from('bookings')
    .select('id,project_id,customer_id,co_buyers,status')
    .eq('id', bookingId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Cancelled booking cannot be edited' }, { status: 409 });
  }

  const gate = await requireProjectAccess(booking.project_id as string);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const custId = body.customerId;
  const allBuyerIds = [
    booking.customer_id as string,
    ...((booking.co_buyers as Array<{ customer_id: string }>) ?? []).map(
      (c) => c.customer_id
    )
  ];
  if (!allBuyerIds.includes(custId)) {
    return NextResponse.json(
      { error: 'Customer is not associated with this booking.' },
      { status: 400 }
    );
  }

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }

  const customerPatch: Record<string, unknown> = {
    full_name: body.full_name.trim()
  };
  if (body.phone) customerPatch.phone = body.phone.replace(/\D/g, '');
  if (body.email) customerPatch.email = body.email.trim();
  if (body.dob) customerPatch.dob = body.dob;
  if (body.occupation) customerPatch.occupation = body.occupation;
  if (body.nationality) customerPatch.nationality = body.nationality;
  if (body.guardian_name) customerPatch.guardian_name = body.guardian_name;
  if (body.residential_status) customerPatch.residential_status = body.residential_status;
  if (body.passport_number) customerPatch.passport_number = body.passport_number;
  if (body.office_name_address) customerPatch.office_name_address = body.office_name_address;
  if (body.pan_number) customerPatch.pan_number = normalizePan(body.pan_number);
  if (body.aadhaar_last4) customerPatch.aadhaar_last4 = normalizeAadhaar(body.aadhaar_last4);

  const { error: custErr } = await admin
    .from('customers')
    .update(customerPatch)
    .eq('id', custId);
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });

  if (body.permanent_address?.address_line1) {
    const { data: existing } = await admin
      .from('customer_addresses')
      .select('id')
      .eq('customer_id', custId)
      .eq('kind', 'permanent')
      .maybeSingle();

    const addrPayload = {
      customer_id: custId,
      kind: 'permanent',
      address_line1: body.permanent_address.address_line1,
      city: body.permanent_address.city,
      state: body.permanent_address.state,
      pin: body.permanent_address.pin
    };

    if (existing) {
      await admin
        .from('customer_addresses')
        .update(addrPayload)
        .eq('id', existing.id as string);
    } else {
      await admin.from('customer_addresses').insert(addrPayload);
    }
  }

  if (body.communication_address?.address_line1) {
    const { data: existing } = await admin
      .from('customer_addresses')
      .select('id')
      .eq('customer_id', custId)
      .eq('kind', 'current')
      .maybeSingle();

    const addrPayload = {
      customer_id: custId,
      kind: 'current',
      address_line1: body.communication_address.address_line1,
      city: body.communication_address.city,
      state: body.communication_address.state,
      pin: body.communication_address.pin
    };

    if (existing) {
      await admin
        .from('customer_addresses')
        .update(addrPayload)
        .eq('id', existing.id as string);
    } else {
      await admin.from('customer_addresses').insert(addrPayload);
    }
  }

  return NextResponse.json({ ok: true });
}
