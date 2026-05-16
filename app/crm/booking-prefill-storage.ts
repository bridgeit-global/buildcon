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

/** Reads and removes booking prefill from session storage. */
export function readConsumeBookingPrefill(): BookingPrefillV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<BookingPrefillV1>;
    if (o.version !== 1 || !o.projectId || !o.unitId) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    sessionStorage.removeItem(KEY);
    return o as BookingPrefillV1;
  } catch {
    return null;
  }
}

/** @deprecated Use readConsumeBookingPrefill */
export function readConsumeBookingPrefillForProject(
  _activeProjectId?: string | null
): BookingPrefillV1 | null {
  return readConsumeBookingPrefill();
}
