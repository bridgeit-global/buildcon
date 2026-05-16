import {
  normalizeUnitStatusCode,
  STATUS_LABEL,
  UNIT_STATUS_CODES,
  statusLabelForUnit
} from '../inventory/unit-status';

export type InventoryBuckets = {
  available: number;
  booked: number;
  sold: number;
  blocked: number;
};

export type MonthPoint = { month: string; amount: number };
export type SalesVsCollPoint = {
  month: string;
  sales: number;
  collections: number;
};

const CR = 10_000_000;

export function inrToCr(amountInr: number): number {
  return Math.max(0, Number(amountInr) || 0) / CR;
}

export function inrToCrLabel(amountInr: number): string {
  return inrToCr(amountInr).toFixed(2);
}

export type UnitStatusSlice = {
  code: string;
  label: string;
  count: number;
  /** Muted gray segment per design-system (cancelled / unknown). */
  muted?: boolean;
};

/** Map legacy / alias codes to canonical `UNIT_STATUS_CODES` values. */
export function canonicalUnitStatusCode(status: string | null | undefined): string {
  const raw = String(status ?? '').trim();
  const s = normalizeUnitStatusCode(status);
  if (s === 'AVAILABLE' || raw === 'A') return 'AVAILABLE';
  if (s === 'BLOCKED' || raw === 'BL') return 'BLOCKED';
  if (s === 'TOKEN') return 'TOKEN';
  if (s === 'BOOKED' || raw === 'B') return 'BOOKED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (['AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED'].includes(s)) return s;
  if (raw === 'S') return 'REGISTERED';
  return s || 'UNKNOWN';
}

export function countUnitStatusBreakdown(
  statuses: Array<string | null | undefined>
): UnitStatusSlice[] {
  const counts = new Map<string, number>();
  for (const st of statuses) {
    const code = canonicalUnitStatusCode(st);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const slices: UnitStatusSlice[] = [];
  const seen = new Set<string>();

  const isMuted = (code: string) => code === 'CANCELLED' || code === 'UNKNOWN';

  for (const code of UNIT_STATUS_CODES) {
    const count = counts.get(code) ?? 0;
    if (count <= 0) continue;
    seen.add(code);
    slices.push({
      code,
      label: STATUS_LABEL[code] ?? code,
      count,
      muted: isMuted(code)
    });
  }

  for (const [code, count] of counts) {
    if (count <= 0 || seen.has(code)) continue;
    slices.push({
      code,
      label: statusLabelForUnit(code),
      count,
      muted: isMuted(code)
    });
  }

  return slices;
}

export function bucketUnitStatus(status: string | null | undefined): keyof InventoryBuckets | 'other' {
  const raw = String(status ?? '').trim();
  const s = normalizeUnitStatusCode(status);
  if (s === 'AVAILABLE' || raw === 'A') return 'available';
  if (s === 'BLOCKED' || raw === 'BL') return 'blocked';
  if (s === 'TOKEN' || s === 'BOOKED' || raw === 'B') return 'booked';
  if (
    ['AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED'].includes(s) ||
    raw === 'S'
  ) {
    return 'sold';
  }
  return 'other';
}

export function countInventoryBuckets(
  statuses: Array<string | null | undefined>
): InventoryBuckets {
  const out: InventoryBuckets = { available: 0, booked: 0, sold: 0, blocked: 0 };
  for (const st of statuses) {
    const b = bucketUnitStatus(st);
    if (b !== 'other') out[b]++;
  }
  return out;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthKeyFromIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function labelFromMonthKey(key: string): string {
  const [, m] = key.split('-');
  const idx = Number(m) - 1;
  return MONTH_SHORT[idx] ?? key;
}

/** Last N calendar months (oldest → newest) as YYYY-MM keys. */
export function recentMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export function seriesFromMonthMap(
  keys: string[],
  map: Record<string, number>
): MonthPoint[] {
  return keys.map((key) => ({
    month: labelFromMonthKey(key),
    amount: inrToCr(map[key] ?? 0)
  }));
}

export function salesVsCollectionsSeries(
  keys: string[],
  salesMap: Record<string, number>,
  collMap: Record<string, number>
): SalesVsCollPoint[] {
  return keys.map((key) => ({
    month: labelFromMonthKey(key),
    sales: inrToCr(salesMap[key] ?? 0),
    collections: inrToCr(collMap[key] ?? 0)
  }));
}
