/** Walk-in is stored as Direct — normalize legacy values for display and filters. */
export function normalizeLeadSource(source: string): string {
  const s = String(source || '').trim();
  if (!s) return 'Unknown';
  if (s.toLowerCase().replace(/\s+/g, '-') === 'walk-in') return 'Direct';
  return s;
}
