import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { toNotifyBookingDocumentResponse } from '@/lib/booking/notify-generated-booking-document-server';
import { sendInquiryCostSheetServer } from '@/lib/inquiry/send-inquiry-cost-sheet-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  unitId?: string;
  parkingRequired?: 'Yes' | 'No';
  parkingCount?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  preferShareLink?: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inquiryId } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const unitId = String(body.unitId ?? '').trim();
  if (!unitId) {
    return NextResponse.json(
      { error: 'Select a unit before sending the cost sheet.' },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: inquiry, error: inqErr } = await admin
    .from('sales_inquiries')
    .select('id, project_id')
    .eq('id', inquiryId)
    .maybeSingle();

  if (inqErr) {
    return NextResponse.json({ error: 'Could not load enquiry.' }, { status: 500 });
  }
  if (!inquiry) {
    return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
  }

  const projectId = String(inquiry.project_id || '').trim();
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parkingRequired = body.parkingRequired === 'Yes' ? 'Yes' : 'No';
  const parkingCount = String(body.parkingCount ?? '1').trim() || '1';

  const result = await sendInquiryCostSheetServer(admin, {
    inquiryId,
    unitId,
    parkingRequired,
    parkingCount,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone,
    generatedBy: gate.userId,
    preferShareLink: body.preferShareLink === true
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(toNotifyBookingDocumentResponse(result.dispatch));
}
