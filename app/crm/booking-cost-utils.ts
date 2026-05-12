import {
  STATUS_LABEL,
  agreementValueLac,
  formatFloorLabel
} from './inventory/inventory-utils';

/** Maps inquiry parking_count option to a number for cost (4+ → 4). */
export function parkingSlotsAskedFromCount(count: string): number {
  const t = String(count || '').trim();
  if (t === '4+') return 4;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

export type ProjectParkingMeta = {
  parking_slots: number | null;
  parking_rate: number | null;
};

export function formatProjectParkingSummary(p: ProjectParkingMeta | null): string {
  if (!p) return '—';
  const s = p.parking_slots;
  const r = p.parking_rate;
  if (s == null || s <= 0) return 'Not configured on project';
  const ratePart =
    r != null && r > 0 ? ` · ₹${r.toLocaleString('en-IN')} / slot` : '';
  return `${s} slot${s !== 1 ? 's' : ''} available${ratePart}`;
}

export type UnitCostInput = {
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  area: number | null;
  rate: number | null;
  status: string;
};

export function computeBookingCostBreakdown(
  unit: UnitCostInput,
  parkingRequired: 'Yes' | 'No',
  parkingCount: string,
  /** Prefer inquiry snapshot; fallback to live project parking rate */
  parkingRatePerSlot: number | null,
  projectParking?: ProjectParkingMeta | null
) {
  const area = Number(unit.area) || 0;
  const rate = Number(unit.rate) || 0;
  const basicInr = area * rate;
  const lac = agreementValueLac(unit.area, unit.rate);
  const st = String(unit.status || '').toUpperCase();
  const statusLabel =
    STATUS_LABEL[unit.status] ??
    STATUS_LABEL[st] ??
    (st === 'AVAILABLE' ? 'Available' : unit.status);

  const slotRate =
    parkingRatePerSlot != null && parkingRatePerSlot > 0
      ? parkingRatePerSlot
      : 0;
  const slotsAsked =
    parkingRequired === 'Yes' ? parkingSlotsAskedFromCount(parkingCount) : 0;
  const parkingExtraInr =
    parkingRequired === 'Yes' && slotRate > 0 ? slotsAsked * slotRate : 0;
  const grandTotalInr = basicInr + parkingExtraInr;

  const rows: [string, string][] = [
    ['Floor', formatFloorLabel(unit.floor, unit.unit_type)],
    ['Configuration', unit.unit_type?.trim() || '—'],
    ['Status', statusLabel || '—'],
    ['Sale area', area > 0 ? `${area.toLocaleString('en-IN')} sq.ft` : '—'],
    [
      'Basic rate',
      rate > 0 ? `₹ ${rate.toLocaleString('en-IN')} / sq.ft` : '—'
    ],
    [
      'Agreement value (basic)',
      basicInr > 0
        ? `₹ ${lac.toFixed(2)} Lac (₹ ${basicInr.toLocaleString('en-IN')})`
        : '—'
    ],
    [
      'Parking availability (project)',
      formatProjectParkingSummary(projectParking ?? null)
    ]
  ];

  if (parkingRequired === 'Yes') {
    rows.push([
      'Parking (customer ask)',
      `Yes · ${parkingCount} slot${slotsAsked !== 1 ? 's' : ''}`
    ]);
    if (slotRate > 0) {
      rows.push([
        'Parking extra (est.)',
        parkingExtraInr > 0
          ? `₹ ${parkingExtraInr.toLocaleString('en-IN')} (${slotsAsked} × ₹ ${slotRate.toLocaleString('en-IN')})`
          : '—'
      ]);
    } else {
      rows.push([
        'Parking extra (est.)',
        'Set project parking rate to estimate'
      ]);
    }
  }

  if (grandTotalInr > 0 && parkingRequired === 'Yes' && parkingExtraInr > 0) {
    rows.push([
      'Estimated total (basic + parking)',
      `₹ ${grandTotalInr.toLocaleString('en-IN')}`
    ]);
  }

  return {
    basicInr,
    lac,
    parkingExtraInr,
    grandTotalInr,
    slotsAsked,
    slotRate,
    rows,
    unitHeadline: `${unit.unit_code} · ${unit.wing_name}`
  };
}
