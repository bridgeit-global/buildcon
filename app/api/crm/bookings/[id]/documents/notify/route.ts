import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { BOOKING_DOCUMENT_KIND_LABEL } from '@/lib/booking/booking-generated-doc-kind';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { parseKindFromBookingGeneratedPath } from '@/lib/booking/booking-generated-doc-kind';

type Body = { generatedDocumentId?: string };

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function phoneToWaDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = digitsOnly(phone);
  if (d.length === 10) d = `91${d}`;
  if (d.length < 10) return null;
  return d;
}

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
    return NextResponse.json({ error: 'generatedDocumentId is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: genRow, error: genErr } = await admin
    .from('generated_documents')
    .select('id,project_id,booking_id,storage_path,customer_id')
    .eq('id', generatedDocumentId)
    .maybeSingle();

  if (genErr) return NextResponse.json({ error: genErr.message }, { status: 500 });
  if (!genRow || genRow.booking_id !== bookingId) {
    return NextResponse.json({ error: 'Document not found for this booking' }, { status: 404 });
  }

  const projectId = genRow.project_id as string;
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const storagePath = genRow.storage_path as string;
  const bucket = storagePath.startsWith('documents/') ? 'documents' : null;
  if (!bucket) {
    return NextResponse.json(
      { error: 'This record has no downloadable file in storage.' },
      { status: 400 }
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Could not create download link' },
      { status: 500 }
    );
  }

  const kind = parseKindFromBookingGeneratedPath(storagePath) as BookingDocumentPrintKind | null;
  const docLabel = kind ? BOOKING_DOCUMENT_KIND_LABEL[kind] : 'Booking document';

  const { data: customer, error: cErr } = await admin
    .from('customers')
    .select('full_name,email,phone')
    .eq('id', genRow.customer_id as string)
    .maybeSingle();

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const email = String(customer?.email ?? '').trim();
  const fullName = String(customer?.full_name ?? 'Customer').trim();
  const phoneDigits = phoneToWaDigits(customer?.phone as string | null);

  const waText = [
    `Hello ${fullName},`,
    '',
    `Your ${docLabel} from BuildCon is ready.`,
    `Download (link valid 7 days): ${signed.signedUrl}`,
    '',
    '— BuildCon CRM'
  ].join('\n');

  const whatsappUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waText)}`
    : null;

  let emailSent = false;
  let emailError: string | null = null;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.CRM_DOCUMENTS_EMAIL_FROM;

  if (resendKey && from && email) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `${docLabel} — ready to download`,
          html: `<p>Dear ${escapeHtml(fullName)},</p>
<p>Your <strong>${escapeHtml(docLabel)}</strong> is ready.</p>
<p><a href="${signed.signedUrl}">Download document</a> (link valid for 7 days).</p>
<p>You can open the file in your browser and use <strong>Print → Save as PDF</strong> if you need a PDF copy.</p>
<p>— BuildCon</p>`
        })
      });
      if (!res.ok) {
        const t = await res.text();
        emailError = t || res.statusText;
      } else {
        emailSent = true;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'Email request failed';
    }
  }

  return NextResponse.json({
    ok: true,
    docLabel,
    emailSent,
    emailSkippedReason:
      !resendKey || !from
        ? 'Set RESEND_API_KEY and CRM_DOCUMENTS_EMAIL_FROM to send email automatically.'
        : !email
          ? 'Customer has no email on file.'
          : emailError
            ? emailError
            : undefined,
    whatsappUrl,
    whatsappSkippedReason: phoneDigits ? undefined : 'Customer has no usable mobile number on file.'
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
