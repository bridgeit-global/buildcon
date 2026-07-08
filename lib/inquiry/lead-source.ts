/** Walk-in is stored as Direct — normalize legacy values for display and filters. */
export function normalizeLeadSource(source: string): string {
  const s = String(source || '').trim();
  if (!s) return 'Unknown';
  if (s.toLowerCase().replace(/\s+/g, '-') === 'walk-in') return 'Direct';
  return s;
}

export function resolveLeadSourceFormState(
  storedValue: string,
  masterNames: readonly string[]
): { leadSource: string; leadSourceOther: string } {
  const normalized = normalizeLeadSource(storedValue);
  if ((masterNames as readonly string[]).includes(normalized)) {
    return { leadSource: normalized, leadSourceOther: '' };
  }
  if (normalized && normalized !== 'Unknown') {
    return { leadSource: 'Other', leadSourceOther: normalized };
  }
  const fallback = (masterNames as readonly string[]).includes('Direct')
    ? 'Direct'
    : masterNames[0] ?? 'Direct';
  return { leadSource: fallback, leadSourceOther: '' };
}

export function persistedLeadSourceValue(
  leadSource: string,
  leadSourceOther: string
): string {
  const selected = String(leadSource || '').trim();
  if (selected === 'Other') {
    const custom = String(leadSourceOther || '').trim();
    return custom || 'Other';
  }
  return selected || 'Direct';
}
