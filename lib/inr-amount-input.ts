/** Strip commas/spaces and keep digits (and optional single decimal point). */
export function sanitizeInrAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/\s/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const intPart = cleaned.slice(0, firstDot).replace(/\./g, '');
  const dec = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  if (!intPart && !dec) return '';
  return dec.length > 0 ? `${intPart || '0'}.${dec}` : intPart;
}

/** Display value with Indian digit grouping (e.g. 12,34,567). */
export function formatInrAmountInputDisplay(
  raw: string,
  options?: { maximumFractionDigits?: number }
): string {
  const s = sanitizeInrAmountInput(raw);
  if (!s) return '';
  const maxFrac = options?.maximumFractionDigits ?? 2;
  if (s.includes('.')) {
    const [intPart, dec] = s.split('.');
    const intNum = Number(intPart || 0);
    const formattedInt = Number.isFinite(intNum)
      ? intNum.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : intPart;
    return dec !== undefined && dec.length > 0
      ? `${formattedInt}.${dec.slice(0, maxFrac)}`
      : formattedInt;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-IN', {
    maximumFractionDigits: 0
  });
}

/** Parse stored/raw amount string to number (NaN if empty/invalid). */
export function parseInrAmountInput(raw: string): number {
  const s = sanitizeInrAmountInput(raw);
  if (!s) return NaN;
  return Number(s);
}
