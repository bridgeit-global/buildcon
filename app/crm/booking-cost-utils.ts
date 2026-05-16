import {
  formatInr,
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
  unit_no?: number | null;
  project_name?: string | null;
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

function areaSqftLabel(n: number | null | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v.toLocaleString('en-IN')} sq.ft` : '—';
}

/** Physical / inventory attributes for cost sheet and quotations. */
export function buildUnitSpecificationRows(unit: UnitCostInput): [string, string][] {
  const billable = unitBillableAreaSqft(unit);
  const legacyArea = Number(unit.area) || 0;
  const billableNote =
    billable > 0
      ? `${billable.toLocaleString('en-IN')} sq.ft` +
        (legacyArea > 0 && legacyArea !== billable
          ? ` (legacy saleable ${legacyArea.toLocaleString('en-IN')})`
          : '')
      : legacyArea > 0
        ? `${legacyArea.toLocaleString('en-IN')} sq.ft (legacy saleable)`
        : '—';

  const rows: [string, string][] = [];
  const project = String(unit.project_name || '').trim();
  if (project) rows.push(['Project', project]);
  rows.push(
    ['Unit code', unit.unit_code || '—'],
    ['Wing / tower', unit.wing_name?.trim() || '—'],
    ['Floor', formatFloorLabel(unit.floor, unit.unit_type)],
    [
      'Unit slot on floor',
      unit.unit_no != null && Number.isFinite(unit.unit_no)
        ? String(unit.unit_no)
        : '—'
    ],
    ['Configuration', unit.unit_type?.trim() || '—'],
    ['Status', statusLabelForUnit(unit.status) || '—'],
    ['Carpet area', areaSqftLabel(unit.carpet_area)],
    ['BUA area', areaSqftLabel(unit.bua_area)],
    ['Saleable area', areaSqftLabel(unit.area)],
    ['Billable (pricing)', billableNote]
  );

  const pk = Math.max(0, Math.floor(Number(unit.parking_slots_included) || 0));
  rows.push([
    'Parking bundled with unit',
    pk > 0 ? `${pk} slot${pk !== 1 ? 's' : ''}` : '—'
  ]);

  return rows;
}

export function computeBookingCostBreakdown(
  unit: UnitCostInput,
  parkingRequired: 'Yes' | 'No',
  parkingCount: string,
  /** Prefer inquiry snapshot; fallback to live project parking rate */
  parkingRatePerSlot: number | null,
  projectParking?: ProjectParkingMeta | null,
  pricing?: ProjectPricingMeta | null,
  options?: { applyDefaultGst?: boolean }
) {
  const billable = unitBillableAreaSqft(unit);
  const rate = Number(unit.rate) || 0;
  const basicInr = unitBaseAgreementInr(unit);
  const fr = Math.max(0, Number(unit.floor_rise_charge) || 0);
  const plc = Math.max(0, Number(unit.plc_charge) || 0);
  const agreementDwellingInr = unitAgreementTotalInr(unit);
  const lac = agreementDwellingInr / 100000;

  const slotRate =
    parkingRatePerSlot != null && parkingRatePerSlot > 0
      ? parkingRatePerSlot
      : 0;
  const slotsAsked =
    parkingRequired === 'Yes' ? parkingSlotsAskedFromCount(parkingCount) : 0;
  const parkingExtraInr =
    parkingRequired === 'Yes' && slotRate > 0 ? slotsAsked * slotRate : 0;
  let grandTotalInr = agreementDwellingInr + parkingExtraInr;

  const specRows = buildUnitSpecificationRows(unit);

  const pricingRows: [string, string][] = [
    [
      'Basic rate',
      rate > 0 ? `₹ ${formatInr(rate)} / sq.ft` : '—'
    ],
    [
      'Base (billable × rate)',
      basicInr > 0 && billable > 0 && rate > 0
        ? `₹ ${formatInr(basicInr)} (${billable.toLocaleString('en-IN')} × ₹ ${formatInr(rate)})`
        : basicInr > 0
          ? `₹ ${formatInr(basicInr)}`
          : '—'
    ],
    [
      'Floor-rise (lump)',
      fr > 0 ? `₹ ${formatInr(fr)}` : '—'
    ],
    ['PLC (lump)', plc > 0 ? `₹ ${formatInr(plc)}` : '—'],
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
  ];

  if (parkingRequired === 'Yes') {
    pricingRows.push([
      'Parking (customer ask)',
      `Yes · ${parkingCount} slot${slotsAsked !== 1 ? 's' : ''}`
    ]);
    if (slotRate > 0) {
      pricingRows.push([
        'Parking extra (est.)',
        parkingExtraInr > 0
          ? `₹ ${parkingExtraInr.toLocaleString('en-IN')} (${slotsAsked} × ₹ ${slotRate.toLocaleString('en-IN')})`
          : '—'
      ]);
    } else {
      pricingRows.push([
        'Parking extra (est.)',
        'Set project parking rate to estimate'
      ]);
    }
  }

  if (pricing?.gst_registered && (pricing.gst_percent ?? 0) > 0) {
    const pct = Number(pricing.gst_percent) || 0;
    const gstAmt = Math.round(grandTotalInr * (pct / 100));
    pricingRows.push([
      `GST (est. ${pct}%)`,
      gstAmt > 0 ? `₹ ${formatInr(gstAmt)}` : '—'
    ]);
    grandTotalInr += gstAmt;
  } else if (options?.applyDefaultGst && agreementDwellingInr > 0) {
    const gstAmt = Math.round(agreementDwellingInr * 0.05);
    pricingRows.push([
      'GST (est. 5%)',
      `₹ ${formatInr(gstAmt)} (₹ ${gstAmt.toLocaleString('en-IN')})`
    ]);
    grandTotalInr += gstAmt;
  }

  if (pricing && (pricing.stamp_duty_percent ?? 0) > 0) {
    const pct = Number(pricing.stamp_duty_percent) || 0;
    const stamp = Math.round(agreementDwellingInr * (pct / 100));
    pricingRows.push([
      `Stamp duty (est. ${pct}% of dwelling)`,
      stamp > 0 ? `₹ ${formatInr(stamp)}` : '—'
    ]);
    grandTotalInr += stamp;
  }

  if (pricing && (pricing.registration_fee ?? 0) > 0) {
    const reg = Math.round(Number(pricing.registration_fee));
    pricingRows.push(['Registration (est.)', `₹ ${formatInr(reg)}`]);
    grandTotalInr += reg;
  }

  if (grandTotalInr > 0) {
    pricingRows.push([
      'Estimated total',
      `${formatInrCompactLacCr(grandTotalInr)} (₹ ${grandTotalInr.toLocaleString('en-IN')})`
    ]);
  }

  const rows = [...specRows, ...pricingRows];

  return {
    basicInr,
    lac,
    parkingExtraInr,
    grandTotalInr,
    slotsAsked,
    slotRate,
    rows,
    specRows,
    pricingRows,
    unitHeadline: `${unit.unit_code} · ${unit.wing_name}`
  };
}
