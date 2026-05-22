/** User-facing dates in CRM and prints: dd-mm-yyyy (day-first). */

function coerceDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDisplayDate(
  value: string | Date | null | undefined
): string {
  if (value == null || value === '') return '—';
  const d = coerceDate(value);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatDisplayDateTime(
  value: string | Date | null | undefined
): string {
  if (value == null || value === '') return '—';
  const d = coerceDate(value);
  if (!d) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${formatDisplayDate(d)}, ${hours}:${minutes}`;
}
