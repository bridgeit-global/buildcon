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
