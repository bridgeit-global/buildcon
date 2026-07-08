export const MASTER_LOOKUP_KINDS = [
  'lead_source',
  'unit_type',
  'unit_category',
  'customer_relation'
] as const;

export type MasterLookupKind = (typeof MASTER_LOOKUP_KINDS)[number];

export const MASTER_LOOKUP_KIND_LABELS: Record<MasterLookupKind, string> = {
  lead_source: 'Lead sources',
  unit_type: 'Unit types',
  unit_category: 'Unit categories',
  customer_relation: 'Customer relations'
};

export const MASTER_LOOKUP_OTHER_VALUE = 'Other';

export type MasterLookupItem = {
  id: string;
  kind: MasterLookupKind;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export function isMasterLookupKind(value: string): value is MasterLookupKind {
  return (MASTER_LOOKUP_KINDS as readonly string[]).includes(value);
}

/** Merge master names with values already stored on records (preserves legacy/custom). */
export function mergeLookupOptions(
  masterNames: string[],
  existingValues: Iterable<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of masterNames) {
    const t = String(name || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  for (const raw of existingValues) {
    const t = String(raw || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function sortMasterLookupItems(
  items: MasterLookupItem[]
): MasterLookupItem[] {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}
