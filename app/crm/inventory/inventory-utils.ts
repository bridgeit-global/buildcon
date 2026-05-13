export {
  STATUS_COLOR,
  STATUS_LABEL,
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  isUnitBookedOrBeyond,
  isUnitLinkedToBookingRecord,
  isUnitSelectableForInquiry,
  normalizeUnitStatusCode,
  statusLabelForUnit,
  UNIT_STATUS_CODES,
  unitStatusGridAbbrev
} from './unit-status';
export type { UnitStatusCode } from './unit-status';

export function isParkingType(typeValue: string | null | undefined) {
  return String(typeValue || '')
    .toLowerCase()
    .includes('parking');
}

export function formatFloorLabel(
  floorValue: number | null | undefined,
  typeValue: string | null | undefined
) {
  const floorNum = Number(floorValue);
  if (!Number.isFinite(floorNum)) return '—';
  if (isParkingType(typeValue) || floorNum < 0) {
    return floorNum < 0 ? `Parking B${Math.abs(floorNum)}` : 'Parking';
  }
  if (floorNum === 0) return 'Ground Floor';
  return `Floor ${floorNum}`;
}

export function formatFloorChipLabel(
  floorValue: number | null | undefined,
  typeValue: string | null | undefined
) {
  const floorNum = Number(floorValue);
  if (!Number.isFinite(floorNum)) return '—';
  if (isParkingType(typeValue) || floorNum < 0) {
    return floorNum < 0 ? `P-B${Math.abs(floorNum)}` : 'Parking';
  }
  if (floorNum === 0) return 'GF';
  return `F${floorNum}`;
}

export function agreementValueLac(
  area: number | null | undefined,
  rate: number | null | undefined
) {
  const a = Number(area) || 0;
  const r = Number(rate) || 0;
  return (a * r) / 100000;
}
