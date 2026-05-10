export const STATUS_COLOR: Record<string, string> = {
  A: '#22C55E',
  B: '#F59E0B',
  S: '#EF4444',
  RR: '#818CF8',
  BL: '#64748B'
};

export const STATUS_LABEL: Record<string, string> = {
  A: 'Available',
  B: 'Booked',
  S: 'Sold',
  RR: 'Rehab Rsv',
  BL: 'Blocked'
};

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
