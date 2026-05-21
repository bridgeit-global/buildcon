import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { dispatchGeneratedDocumentNotification } from '@/lib/notifications/dispatch-notification';
import { toNotifyBookingDocumentResponse } from '@/lib/booking/notify-generated-booking-document-server';

type Body = { generatedDocumentId?: string; preferShareLink?: boolean };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const generatedDocumentId = String(body.generatedDocumentId ?? '').trim();
  if (!generatedDocumentId) {
    return NextResponse.json(
      { error: 'generatedDocumentId is required' },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: genRow, error: genErr } = await admin
    .from('generated_documents')
    .select('id,project_id,booking_id')
    .eq('id', generatedDocumentId)
    .maybeSingle();

  if (genErr) return NextResponse.json({ error: genErr.message }, { status: 500 });
  if (!genRow || genRow.booking_id !== bookingId) {
    return NextResponse.json(
      { error: 'Document not found for this booking' },
      { status: 404 }
    );
  }

  const projectId = genRow.project_id as string;
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await dispatchGeneratedDocumentNotification(admin, generatedDocumentId, {
    preferShareLink: body.preferShareLink === true
  });

  return NextResponse.json(toNotifyBookingDocumentResponse(result));
}
