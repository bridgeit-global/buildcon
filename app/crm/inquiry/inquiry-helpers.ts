import type { InquiryRowDb } from './inquiry-types';

export function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export function unitDisplayName(u: {
  unit_code: string;
  wing_name: string;
  project_name?: string | null;
}) {
  const pn = String(u.project_name ?? '').trim();
  return pn
    ? `${pn} · ${u.unit_code} · ${u.wing_name}`
    : `${u.unit_code} · ${u.wing_name}`;
}

export function inquiryProjectLabel(
  row: Pick<InquiryRowDb, 'projects'>
): string {
  return String(embedOne(row.projects)?.name ?? '').trim();
}

export function inquiryUnitLabelFromRow(
  row: Pick<InquiryRowDb, 'unit_id' | 'units'>
): string {
  const u = embedOne(row.units);
  if (!u) return row.unit_id || '—';
  const pn = String(embedOne(u.projects)?.name ?? '').trim() || null;
  return unitDisplayName({
    unit_code: u.unit_code,
    wing_name: u.wing_name,
    project_name: pn
  });
}

export function inquiryReference(id: string) {
  const compact = id.replace(/-/g, '');
  return `INQ-${compact.slice(0, 10).toUpperCase()}`;
}
