/** Normalize PAN to uppercase alphanumeric (max 10). */
export function normalizePan(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

/** Last 4 digits of Aadhaar only. */
export function normalizeAadhaarLast4(value: string): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(-4);
}

export function isPanValid(pan: string): boolean {
  const p = normalizePan(pan);
  return p.length >= 10 && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p);
}

export function isAadhaarLast4Valid(last4: string): boolean {
  return normalizeAadhaarLast4(last4).length === 4;
}

export function customerHasKycDocs(docTypes: Iterable<string>): {
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
} {
  const set = new Set(docTypes);
  return { hasPanDoc: set.has('pan'), hasAadhaarDoc: set.has('aadhaar') };
}

/** PAN + Aadhaar last-4 on file and both document types uploaded. */
export function isCustomerKycComplete(
  pan: string | null | undefined,
  aadhaarLast4: string | null | undefined,
  docTypes: Iterable<string>
): boolean {
  const { hasPanDoc, hasAadhaarDoc } = customerHasKycDocs(docTypes);
  return (
    isPanValid(pan ?? '') &&
    isAadhaarLast4Valid(aadhaarLast4 ?? '') &&
    hasPanDoc &&
    hasAadhaarDoc
  );
}

export function maskAadhaarLast4(last4: string | null | undefined): string {
  const d = normalizeAadhaarLast4(last4 ?? '');
  return d.length === 4 ? `XXXX-XXXX-${d}` : '—';
}
