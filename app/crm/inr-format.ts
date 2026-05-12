const LAC = 100_000;

/** Full amount with Indian digit grouping (e.g. ₹ 12,34,567). */
export function formatInr(
  n: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    ...options
  });
}

/**
 * Compact Indian real-estate style: Lac below ₹1 Cr, Cr from ₹1 Cr upward.
 * `totalInr` is the full amount in rupees.
 */
export function formatInrCompactLacCr(
  totalInr: number | null | undefined
): string {
  const v = Number(totalInr);
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '₹ 0';
  if (v < 0) {
    const pos = formatInrCompactLacCr(-v);
    return pos === '—' ? '—' : pos.replace(/^₹ /u, '₹ −');
  }
  const lac = v / LAC;
  if (lac >= 100) {
    return `₹ ${(lac / 100).toFixed(2)} Cr`;
  }
  return `₹ ${lac.toFixed(2)} Lac`;
}

export function formatAgreementValueCompact(
  area: number | null | undefined,
  rate: number | null | undefined
): string {
  const total = (Number(area) || 0) * (Number(rate) || 0);
  return formatInrCompactLacCr(total);
}
