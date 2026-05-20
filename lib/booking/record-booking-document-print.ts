import type { SupabaseClient } from '@supabase/supabase-js';

export type BookingDocumentPrintKind =
  | 'application-form'
  | 'allotment-letter'
  | 'receipt'
  | 'demand-letter'
  | 'agreement';

/** Persists a row when staff prints a booking PDF from the browser (no file upload yet). */
export async function recordBookingDocumentPrint(
  supabase: SupabaseClient,
  opts: {
    projectId: string;
    bookingId: string;
    customerId: string;
    kind: BookingDocumentPrintKind;
  }
): Promise<{ error: string | null }> {
  const jobId = crypto.randomUUID();
  const storagePath = `print/${opts.kind}/${opts.bookingId}/${jobId}`;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('generated_documents').insert({
    project_id: opts.projectId,
    booking_id: opts.bookingId,
    customer_id: opts.customerId,
    template_id: null,
    storage_path: storagePath,
    generated_by: user?.id ?? null
  });
  return { error: error?.message ?? null };
}
