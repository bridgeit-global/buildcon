const KEY = 'crm_booking_prefill_v1';

export type BookingPrefillV1 = {
  version: 1;
  projectId: string;
  inquiryId: string | null;
  inquiryRef: string | null;
  /** From inquiry flow; null when opening booking from inventory (customer chosen on bookings page). */
  customerId: string | null;
  unitId: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  parkingSlotsAvailable: number | null;
  parkingRateSnapshot: number | null;
};

export function writeBookingPrefill(
  data: Omit<BookingPrefillV1, 'version'>
): void {
  if (typeof window === 'undefined') return;
  const payload: BookingPrefillV1 = { version: 1, ...data };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

/**
 * Reads prefill when it matches the active CRM project, then removes it from storage.
 * If the active project does not match yet, leaves storage intact (user may switch project).
 */
export function readConsumeBookingPrefillForProject(
  activeProjectId: string | null | undefined
): BookingPrefillV1 | null {
  if (!activeProjectId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<BookingPrefillV1>;
    if (o.version !== 1 || !o.projectId || !o.unitId) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (o.projectId !== activeProjectId) return null;
    sessionStorage.removeItem(KEY);
    return o as BookingPrefillV1;
  } catch {
    return null;
  }
}
