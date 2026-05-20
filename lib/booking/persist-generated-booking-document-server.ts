import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import {
  buildBookingDocumentHtmlFromPack,
  type BookingDocumentHtmlOverrides
} from '@/lib/booking/booking-document-html-from-pack';
import { renderHtmlToPdfBuffer } from '@/lib/booking/html-to-pdf';
import { bookingGeneratedStoragePath } from '@/lib/booking/booking-generated-storage-path';

export type PersistGeneratedBookingDocumentOpts = {
  /** Collection or schedule id — stored in filename so each payment/demand is a separate file. */
  linkId?: string | null;
  htmlOverrides?: BookingDocumentHtmlOverrides;
  generatedBy?: string | null;
};

/** Uploads printable PDF to the private `documents` bucket and inserts `generated_documents`. */
export async function persistGeneratedBookingDocumentServer(
  admin: SupabaseClient,
  pack: BookingPrintPack,
  kind: BookingDocumentPrintKind,
  opts?: PersistGeneratedBookingDocumentOpts
): Promise<{ ok: true; id: string; storagePath: string } | { ok: false; error: string }> {
  const html = buildBookingDocumentHtmlFromPack(kind, pack, opts?.htmlOverrides);
  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdfBuffer(html);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF rendering failed'
    };
  }

  const projectId = pack.booking.project_id;
  const bookingId = pack.booking.id;
  const fileId = crypto.randomUUID();
  const storagePath = bookingGeneratedStoragePath({
    projectId,
    bookingId,
    kind,
    linkId: opts?.linkId,
    fileId
  });

  const { error: upErr } = await admin.storage
    .from('documents')
    .upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (upErr) return { ok: false, error: upErr.message };

  const { data: row, error: insErr } = await admin
    .from('generated_documents')
    .insert({
      project_id: projectId,
      booking_id: bookingId,
      customer_id: pack.booking.customer_id,
      template_id: null,
      storage_path: storagePath,
      generated_by: opts?.generatedBy ?? null
    })
    .select('id')
    .maybeSingle();

  if (insErr || !row?.id) {
    return { ok: false, error: insErr?.message ?? 'Could not save document record' };
  }

  return { ok: true, id: row.id as string, storagePath };
}
