import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { buildBookingDocumentHtmlFromPack } from '@/lib/booking/booking-document-html-from-pack';

/** Uploads printable HTML to the private `documents` bucket and inserts `generated_documents`. */
export async function persistGeneratedBookingDocument(
  supabase: SupabaseClient,
  pack: BookingPrintPack,
  kind: BookingDocumentPrintKind
): Promise<{ ok: true; id: string; storagePath: string } | { ok: false; error: string }> {
  const html = buildBookingDocumentHtmlFromPack(kind, pack);
  const projectId = pack.booking.project_id;
  const bookingId = pack.booking.id;
  const fileId = crypto.randomUUID();
  const storagePath = `documents/project/${projectId}/booking-generated/${bookingId}/${kind}-${fileId}.html`;

  const { error: upErr } = await supabase.storage.from('documents').upload(storagePath, new Blob([html], { type: 'text/html' }), {
    contentType: 'text/html;charset=utf-8',
    upsert: false
  });

  if (upErr) return { ok: false, error: upErr.message };

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: row, error: insErr } = await supabase
    .from('generated_documents')
    .insert({
      project_id: projectId,
      booking_id: bookingId,
      customer_id: pack.booking.customer_id,
      template_id: null,
      storage_path: storagePath,
      generated_by: user?.id ?? null
    })
    .select('id')
    .maybeSingle();

  if (insErr || !row?.id) {
    return { ok: false, error: insErr?.message ?? 'Could not save document record' };
  }

  return { ok: true, id: row.id as string, storagePath };
}
