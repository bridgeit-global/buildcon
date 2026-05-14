import {
  formatInrCompactLacCr,
  unitAgreementTotalInr,
  unitBaseAgreementInr,
  unitBillableAreaSqft
} from './inr-format';
import { formatFloorLabel, statusLabelForUnit } from './inventory/inventory-utils';

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

export type ProjectPricingMeta = {
  gst_registered: boolean;
  gst_percent: number;
  stamp_duty_percent: number;
  registration_fee: number;
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
  carpet_area?: number | null;
  bua_area?: number | null;
  rate: number | null;
  floor_rise_charge?: number | null;
  plc_charge?: number | null;
  parking_slots_included?: number | null;
  status: string;
};

export function computeBookingCostBreakdown(
  unit: UnitCostInput,
  parkingRequired: 'Yes' | 'No',
  parkingCount: string,
  /** Prefer inquiry snapshot; fallback to live project parking rate */
  parkingRatePerSlot: number | null,
  projectParking?: ProjectParkingMeta | null,
  pricing?: ProjectPricingMeta | null
) {
  const billable = unitBillableAreaSqft(unit);
  const legacyArea = Number(unit.area) || 0;
  const rate = Number(unit.rate) || 0;
  const basicInr = unitBaseAgreementInr(unit);
  const fr = Math.max(0, Number(unit.floor_rise_charge) || 0);
  const plc = Math.max(0, Number(unit.plc_charge) || 0);
  const agreementDwellingInr = unitAgreementTotalInr(unit);
  const lac = agreementDwellingInr / 100000;
  const statusLabel = statusLabelForUnit(unit.status);

  const slotRate =
    parkingRatePerSlot != null && parkingRatePerSlot > 0
      ? parkingRatePerSlot
      : 0;
  const slotsAsked =
    parkingRequired === 'Yes' ? parkingSlotsAskedFromCount(parkingCount) : 0;
  const parkingExtraInr =
    parkingRequired === 'Yes' && slotRate > 0 ? slotsAsked * slotRate : 0;
  let grandTotalInr = agreementDwellingInr + parkingExtraInr;

  const areaLabel =
    billable > 0
      ? `${billable.toLocaleString('en-IN')} sq.ft billable` +
        (legacyArea > 0 && legacyArea !== billable
          ? ` (legacy ${legacyArea.toLocaleString('en-IN')})`
          : '')
      : legacyArea > 0
        ? `${legacyArea.toLocaleString('en-IN')} sq.ft`
        : '—';

  const rows: [string, string][] = [
    ['Floor', formatFloorLabel(unit.floor, unit.unit_type)],
    ['Configuration', unit.unit_type?.trim() || '—'],
    ['Status', statusLabel || '—'],
    ['Sale area', areaLabel],
    [
      'Basic rate',
      rate > 0 ? `₹ ${rate.toLocaleString('en-IN')} / sq.ft` : '—'
    ]
  ];

  if (fr > 0) {
    rows.push([
      'Floor-rise (lump)',
      `₹ ${fr.toLocaleString('en-IN')}`
    ]);
  }
  if (plc > 0) {
    rows.push(['PLC (lump)', `₹ ${plc.toLocaleString('en-IN')}`]);
  }

  const pk = Math.max(0, Math.floor(Number(unit.parking_slots_included) || 0));
  if (pk > 0) {
    rows.push(['Parking (with unit)', `${pk} slot${pk !== 1 ? 's' : ''}`]);
  }

  rows.push(
    [
      'Agreement value (dwelling)',
      agreementDwellingInr > 0
        ? `${formatInrCompactLacCr(agreementDwellingInr)} (₹ ${agreementDwellingInr.toLocaleString('en-IN')})`
        : '—'
    ],
    [
      'Parking availability (project)',
      formatProjectParkingSummary(projectParking ?? null)
    ]
  );

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

  if (pricing?.gst_registered && (pricing.gst_percent ?? 0) > 0) {
    const pct = Number(pricing.gst_percent) || 0;
    const gstAmt = Math.round(grandTotalInr * (pct / 100));
    rows.push([
      `GST (est. ${pct}%)`,
      gstAmt > 0
        ? `₹ ${gstAmt.toLocaleString('en-IN')}`
        : '—'
    ]);
    grandTotalInr += gstAmt;
  }

  if (pricing && (pricing.stamp_duty_percent ?? 0) > 0) {
    const pct = Number(pricing.stamp_duty_percent) || 0;
    const stamp = Math.round(agreementDwellingInr * (pct / 100));
    rows.push([
      `Stamp duty (est. ${pct}% of dwelling)`,
      stamp > 0 ? `₹ ${stamp.toLocaleString('en-IN')}` : '—'
    ]);
    grandTotalInr += stamp;
  }

  if (pricing && (pricing.registration_fee ?? 0) > 0) {
    const reg = Math.round(Number(pricing.registration_fee));
    rows.push(['Registration (est.)', `₹ ${reg.toLocaleString('en-IN')}`]);
    grandTotalInr += reg;
  }

  if (grandTotalInr > 0 && parkingRequired === 'Yes' && parkingExtraInr > 0) {
    rows.push([
      'Estimated total (dwelling + parking)',
      `${formatInrCompactLacCr(grandTotalInr)} (₹ ${grandTotalInr.toLocaleString('en-IN')})`
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
