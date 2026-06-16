import { UNIT_STATUS_CODES } from '@/app/crm/inventory/unit-status';

const UNIT_STATUS_SET = new Set<string>(UNIT_STATUS_CODES);

export function normalizeCsvHeader(cell: string) {
  return cell
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(normalizeCsvHeader);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) row[h] = cells[j] ?? '';
    });
    out.push(row);
  }
  return out;
}

export function csvNumeric(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function csvRowToUnitUpsert(
  projectId: string,
  raw: Record<string, string>
): Record<string, unknown> | null {
  const unit_code = (raw.unit_code || raw.code || '').trim();
  if (!unit_code) return null;
  const wing_name =
    (raw.wing_name || raw.wing || raw.structure || '').trim() || 'Default';
  const n = (k: string, alt?: string) =>
    csvNumeric(raw[k]) ?? (alt ? csvNumeric(raw[alt]) : null);
  const floor = n('floor') ?? 1;
  const unit_no = n('unit_no') ?? n('slot') ?? 1;
  const payload: Record<string, unknown> = {
    project_id: projectId,
    unit_code,
    wing_name,
    floor,
    unit_no,
    unit_type: (raw.unit_type || raw.type || '').trim() || null,
    area: n('area') ?? 1,
    carpet_area: n('carpet_area', 'carpet'),
    bua_area: n('bua_area', 'bua'),
    rera_area: n('rera_area', 'rera'),
    terrace_sqft: n('terrace_sqft', 'terrace'),
    deck_sqft: n('deck_sqft', 'deck'),
    loading_sqft: n('loading_sqft', 'loading'),
    rate: n('rate') ?? 1,
    floor_rise_charge: n('floor_rise_charge', 'floor_rise') ?? 0,
    plc_charge: n('plc_charge', 'plc') ?? 0,
    parking_slots_included: Math.max(
      0,
      Math.floor(n('parking_slots_included', 'parking') ?? 0)
    )
  };
  const statusRaw = (raw.status || '').trim().toUpperCase();
  if (statusRaw && UNIT_STATUS_SET.has(statusRaw)) {
    payload.status = statusRaw;
  }
  return payload;
}
