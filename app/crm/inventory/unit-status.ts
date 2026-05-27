/** Canonical unit lifecycle (aligned with PRD). Legacy single-letter codes are normalized in DB migration. */

export const UNIT_STATUS_CODES = [
  'AVAILABLE',
  'BLOCKED',
  'TOKEN',
  'BOOKED',
  'AGREEMENT',
  'REGISTERED',
  'PRE_POSSESSION',
  'POSSESSED',
  'CANCELLED'
] as const;

export type UnitStatusCode = (typeof UNIT_STATUS_CODES)[number];

/** Legacy DB codes before migration — still accepted for reads until data is fully migrated. */
const LEGACY_AVAILABLE = new Set(['A', 'AVAILABLE', 'a']);
const LEGACY_BLOCKED = new Set(['BL', 'BLOCKED']);
const LEGACY_BOOKED = new Set(['B', 'BOOKED']);

export const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  BLOCKED: 'Blocked',
  TOKEN: 'Token received',
  BOOKED: 'Booked',
  AGREEMENT: 'Agreement done',
  REGISTERED: 'Registered',
  PRE_POSSESSION: 'Possession ready',
  POSSESSED: 'Possession given',
  CANCELLED: 'Cancelled',
  // legacy
  A: 'Available',
  BL: 'Blocked',
  B: 'Booked',
  S: 'Registered',
  RF: 'Available'
};

export const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: '#22C55E',
  BLOCKED: '#64748B',
  TOKEN: '#F97316',
  BOOKED: '#3B82F6',
  AGREEMENT: '#8B5CF6',
  REGISTERED: '#6366F1',
  PRE_POSSESSION: '#14B8A6',
  POSSESSED: '#059669',
  CANCELLED: '#EF4444',
  A: '#22C55E',
  BL: '#64748B',
  B: '#3B82F6',
  S: '#6366F1'
};

export function normalizeUnitStatusCode(status: string | null | undefined): string {
  return String(status || '').trim().toUpperCase();
}

export function isUnitAvailableForBooking(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return s === 'AVAILABLE' || LEGACY_AVAILABLE.has(String(status || '').trim());
}

/** Start or continue booking: available, blocked for a lead, or already on token. */
export function isUnitBookableForWorkflow(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return (
    isUnitAvailableForBooking(status) ||
    s === 'TOKEN' ||
    isUnitBlockedStatus(status)
  );
}

/** Inquiry → booking prefill — unit must still be blocked for this lead. */
export function isUnitPrefillableFromInquiry(
  status: string | null | undefined
): boolean {
  return isUnitBlockedStatus(status);
}

/** Create-booking picker and POST — only inventory held (blocked) for a lead. */
export function isUnitSelectableForBookingCreate(
  status: string | null | undefined
): boolean {
  return isUnitBlockedStatus(status);
}

/** DB `in` filter for listing units on the create-booking form. */
export const BOOKING_CREATE_UNIT_STATUS_FILTER = ['BLOCKED', 'BL'] as const;

/** Inquiry / sales flow: show units that can still be pitched. */
export function isUnitSelectableForInquiry(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  if (s === 'AVAILABLE' || s === 'BLOCKED' || s === 'TOKEN') return true;
  const raw = String(status || '').trim();
  return LEGACY_AVAILABLE.has(raw) || LEGACY_BLOCKED.has(raw) || raw === 'TOKEN';
}

export function isUnitBlockedStatus(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return s === 'BLOCKED' || String(status || '').trim() === 'BL';
}

/** Inventory shows token received — enquiry pipeline stages are view-only. */
export function isUnitTokenReceivedStatus(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return s === 'TOKEN' || String(status || '').trim() === 'TOKEN';
}

export function isUnitBookedOrBeyond(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return (
    [
      'BOOKED',
      'AGREEMENT',
      'REGISTERED',
      'PRE_POSSESSION',
      'POSSESSED',
      'TOKEN'
    ].includes(s) ||
    LEGACY_BOOKED.has(String(status || '').trim()) ||
    String(status || '').trim() === 'S'
  );
}

/** Unit likely has a `bookings` row to show in the unit detail dialog. */
export function isUnitLinkedToBookingRecord(status: string | null | undefined): boolean {
  const s = normalizeUnitStatusCode(status);
  return (
    ['BOOKED', 'AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED'].includes(s) ||
    s === 'B' ||
    s === 'S'
  );
}

/** Possession given — sale documents must not be generated for this unit. */
export function isUnitPossessedStatus(status: string | null | undefined): boolean {
  return normalizeUnitStatusCode(status) === 'POSSESSED';
}

export const UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE =
  'This unit is marked as Possession given — documents cannot be generated.';

/** Unit `status` from a Supabase `units (...)` join on bookings. */
export function unitStatusFromBookingUnitsJoin(
  units:
    | { status: string }
    | { status: string }[]
    | null
    | undefined
): string | null {
  if (units == null) return null;
  const row = Array.isArray(units) ? units[0] : units;
  return row?.status ?? null;
}

const GRID_ABBREV: Record<string, string> = {
  AVAILABLE: 'AV',
  BLOCKED: 'BL',
  TOKEN: 'TK',
  BOOKED: 'BK',
  AGREEMENT: 'AG',
  REGISTERED: 'RG',
  PRE_POSSESSION: 'PP',
  POSSESSED: 'PC',
  CANCELLED: 'CX'
};

export function unitStatusGridAbbrev(status: string | null | undefined): string {
  const s = normalizeUnitStatusCode(status);
  return GRID_ABBREV[s] ?? (s.length <= 3 ? s : s.slice(0, 2));
}

export function statusLabelForUnit(status: string | null | undefined): string {
  const raw = String(status || '').trim();
  const s = normalizeUnitStatusCode(status);
  return (
    STATUS_LABEL[raw] ??
    STATUS_LABEL[s] ??
    (s === 'AVAILABLE' ? 'Available' : raw || '—')
  );
}
