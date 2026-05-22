import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAadhaarValid, isCustomerKycComplete, isPanValid } from './kyc-identifiers';
import type { CoBuyerStored } from '@/app/crm/bookings/booking-types';

export type BookingKycReport = {
  kycComplete: boolean;
  missing: Array<{ customerId: string; label: string; needs: string[] }>;
};

/** Server-side KYC check for the primary + co-buyer customers on a booking. */
export async function loadBookingKycReport(
  admin: SupabaseClient,
  bookingId: string
): Promise<{ ok: true; report: BookingKycReport } | { ok: false; error: string }> {
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select('id, customer_id, co_buyers')
    .eq('id', bookingId)
    .maybeSingle();

  if (bErr) return { ok: false, error: bErr.message };
  if (!booking) return { ok: false, error: 'Booking not found' };

  const buyers: Array<{ customerId: string; label: string }> = [
    { customerId: booking.customer_id as string, label: 'Primary applicant' }
  ];
  const co = (booking.co_buyers ?? []) as CoBuyerStored[];
  co.forEach((c, idx) => {
    if (c?.customer_id) {
      buyers.push({
        customerId: c.customer_id,
        label: `Co-applicant ${idx + 1}${c.full_name ? ` (${c.full_name})` : ''}`
      });
    }
  });

  if (buyers.length === 0) {
    return {
      ok: true,
      report: { kycComplete: false, missing: [{ customerId: '', label: 'applicant', needs: ['customer'] }] }
    };
  }

  const customerIds = buyers.map((b) => b.customerId);
  const [{ data: customers, error: cErr }, { data: docs, error: dErr }] =
    await Promise.all([
      admin
        .from('customers')
        .select('id, pan_number, aadhaar_last4')
        .in('id', customerIds),
      admin
        .from('customer_kyc_documents')
        .select('customer_id, doc_type')
        .in('customer_id', customerIds)
    ]);

  if (cErr) return { ok: false, error: cErr.message };
  if (dErr) return { ok: false, error: dErr.message };

  const customerById = new Map<string, { pan: string; aadhaar: string }>();
  for (const row of customers ?? []) {
    customerById.set(row.id as string, {
      pan: String(row.pan_number ?? ''),
      aadhaar: String(row.aadhaar_last4 ?? '')
    });
  }
  const docsByCustomer = new Map<string, Set<string>>();
  for (const row of docs ?? []) {
    const cid = row.customer_id as string;
    const t = String(row.doc_type ?? '').trim().toLowerCase();
    if (!docsByCustomer.has(cid)) docsByCustomer.set(cid, new Set());
    docsByCustomer.get(cid)!.add(t);
  }

  const missing: BookingKycReport['missing'] = [];
  let kycComplete = true;
  for (const b of buyers) {
    const cust = customerById.get(b.customerId) ?? { pan: '', aadhaar: '' };
    const docTypes = docsByCustomer.get(b.customerId) ?? new Set();
    const complete = isCustomerKycComplete(cust.pan, cust.aadhaar, docTypes);
    if (!complete) {
      kycComplete = false;
      const needs: string[] = [];
      if (!isPanValid(cust.pan)) needs.push('PAN number');
      if (!isAadhaarValid(cust.aadhaar)) needs.push('12-digit Aadhaar number');
      if (!docTypes.has('pan')) needs.push('PAN document upload');
      if (!docTypes.has('aadhaar')) needs.push('Aadhaar document upload');
      if (!docTypes.has('photo')) needs.push('Photo upload');
      missing.push({ customerId: b.customerId, label: b.label, needs });
    }
  }

  return { ok: true, report: { kycComplete, missing } };
}
