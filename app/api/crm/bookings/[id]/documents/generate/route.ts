import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import { notifyGeneratedBookingDocumentServer } from '@/lib/booking/notify-generated-booking-document-server';
import { loadBookingKycReport } from '@/lib/customer/server-kyc-loader';
import {
  BOOKING_DOCUMENT_KIND_LABEL,
  parseKindFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';

function labelFor(kind: BookingDocumentPrintKind): string {
  return BOOKING_DOCUMENT_KIND_LABEL[kind] ?? kind;
}

const VALID_KINDS = new Set<BookingDocumentPrintKind>([
  'application-form',
  'allotment-letter',
  'receipt',
  'demand-letter',
  'agreement',
  'registration-deed',
  'possession-letter'
]);

const KIND_REQUIRES_KYC = new Set<BookingDocumentPrintKind>([
  'application-form',
  'allotment-letter',
  'agreement',
  'registration-deed',
  'possession-letter'
]);

/** Document predecessors enforced server-side. PDF for the predecessor must exist. */
const KIND_PREDECESSORS: Partial<Record<BookingDocumentPrintKind, BookingDocumentPrintKind[]>> = {
  'allotment-letter': ['application-form'],
  agreement: ['allotment-letter'],
  'registration-deed': ['agreement'],
  'possession-letter': ['registration-deed']
};

/** Kinds that require all instalment demand to be settled before generation. */
const KIND_REQUIRES_FULLY_PAID = new Set<BookingDocumentPrintKind>([
  'agreement',
  'registration-deed',
  'possession-letter'
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

  if (KIND_REQUIRES_KYC.has(kind)) {
    const kycRes = await loadBookingKycReport(admin, bookingId);
    if (!kycRes.ok) {
      return NextResponse.json({ error: kycRes.error }, { status: 500 });
    }
    if (!kycRes.report.kycComplete) {
      return NextResponse.json(
        {
          error:
            'KYC is incomplete. Complete PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads for the primary buyer and each co-applicant.',
          missing: kycRes.report.missing
        },
        { status: 409 }
      );
    }
  }

  const predecessors = KIND_PREDECESSORS[kind];
  if (predecessors && predecessors.length > 0) {
    const { data: gen } = await admin
      .from('generated_documents')
      .select('storage_path')
      .eq('booking_id', bookingId)
      .limit(500);
    const seenKinds = new Set<BookingDocumentPrintKind>();
    for (const row of gen ?? []) {
      const k = parseKindFromBookingGeneratedPath(row.storage_path as string);
      if (k) seenKinds.add(k);
    }
    const missingPredecessor = predecessors.find((k) => !seenKinds.has(k));
    if (missingPredecessor) {
      return NextResponse.json(
        {
          error: `Generate the ${labelFor(missingPredecessor)} first.`,
          missingPredecessor
        },
        { status: 409 }
      );
    }
  }

  if (KIND_REQUIRES_FULLY_PAID.has(kind)) {
    const { data: outstandingRows, error: vErr } = await admin
      .from('v_payment_schedule_outstanding')
      .select('outstanding_amount')
      .eq('booking_id', bookingId);
    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    const outstandingTotal = (outstandingRows ?? []).reduce(
      (sum, r) => sum + Number((r as { outstanding_amount?: number }).outstanding_amount ?? 0),
      0
    );
    if (outstandingTotal > 0) {
      return NextResponse.json(
        {
          error: `Cannot generate ${labelFor(kind)} until all payment instalments are received. Outstanding amount: ₹${outstandingTotal.toLocaleString('en-IN')}.`,
          outstandingTotal
        },
        { status: 409 }
      );
    }
  }

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

  // Governed unit-status transition for sale / registration / possession milestones.
  const targetStatus: 'AGREEMENT' | 'REGISTERED' | 'PRE_POSSESSION' | null =
    kind === 'agreement'
      ? 'AGREEMENT'
      : kind === 'registration-deed'
        ? 'REGISTERED'
        : kind === 'possession-letter'
          ? 'PRE_POSSESSION'
          : null;
  let unitStatus: string | null = null;
  if (targetStatus) {
    const { data: statusData, error: rpcErr } = await admin.rpc('set_unit_status_for_booking', {
      p_booking_id: bookingId,
      p_target_status: targetStatus
    });
    if (rpcErr) {
      console.warn(
        `set_unit_status_for_booking(${bookingId}, ${targetStatus}) failed: ${rpcErr.message}`
      );
    } else if (typeof statusData === 'string') {
      unitStatus = statusData;
    }
  }

  const shouldNotify = body.notify === true;
  let notify;
  if (shouldNotify) {
    notify = await notifyGeneratedBookingDocumentServer(admin, bookingId, persisted.id);
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
    unitStatus,
    notify
  });
}
