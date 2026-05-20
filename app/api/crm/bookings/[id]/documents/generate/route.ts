import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import { notifyGeneratedBookingDocument } from '@/lib/booking/notify-booking-document';

const VALID_KINDS = new Set<BookingDocumentPrintKind>([
  'application-form',
  'allotment-letter',
  'receipt',
  'demand-letter',
  'agreement'
]);

type Body = {
  kind?: string;
  linkId?: string | null;
  htmlOverrides?: BookingDocumentHtmlOverrides;
  notify?: boolean;
};

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

  const kind = String(body.kind ?? '').trim() as BookingDocumentPrintKind;
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Invalid document kind' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select('id,project_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const gate = await requireProjectAccess(booking.project_id as string);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const packRes = await loadBookingPrintPack(admin, bookingId);
  if (!packRes.ok) {
    return NextResponse.json({ error: packRes.error }, { status: 500 });
  }

  const persisted = await persistGeneratedBookingDocumentServer(
    admin,
    packRes.pack,
    kind,
    {
      linkId: body.linkId,
      htmlOverrides: body.htmlOverrides,
      generatedBy: gate.userId
    }
  );

  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: 500 });
  }

  const shouldNotify = body.notify !== false;
  let notify;
  if (shouldNotify) {
    notify = await notifyGeneratedBookingDocument(bookingId, persisted.id);
    if (!notify.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            typeof notify.error === 'string'
              ? notify.error
              : 'Document was saved but notifying the customer failed.'
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    generatedDocumentId: persisted.id,
    storagePath: persisted.storagePath,
    notify
  });
}
