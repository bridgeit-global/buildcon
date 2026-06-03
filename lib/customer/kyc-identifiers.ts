/** Normalize PAN to uppercase alphanumeric (max 10). */
export function normalizePan(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

/** Aadhaar: digits only, max 12 (stored in `customers.aadhaar_last4`). */
export function normalizeAadhaar(value: string): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 12);
}

/** @deprecated Use {@link normalizeAadhaar}. */
export const normalizeAadhaarLast4 = normalizeAadhaar;

export function isPanValid(pan: string): boolean {
  const p = normalizePan(pan);
  return p.length === 10 && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p);
}

/** True when each entered character matches PAN structure (AAAAA9999A). */
export function isPanPrefixValid(pan: string): boolean {
  const p = normalizePan(pan);
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (i < 5) {
      if (!/[A-Z]/.test(c)) return false;
    } else if (i < 9) {
      if (!/[0-9]/.test(c)) return false;
    } else if (!/[A-Z]/.test(c)) {
      return false;
    }
  }
  return true;
}

export function isAadhaarValid(aadhaar: string): boolean {
  return normalizeAadhaar(aadhaar).length === 12;
}

/** @deprecated Use {@link isAadhaarValid}. */
export const isAadhaarLast4Valid = isAadhaarValid;

export function customerHasKycDocs(docTypes: Iterable<string>): {
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
  hasPhotoDoc: boolean;
} {
  const set = new Set(
    [...docTypes].map((t) => String(t).trim().toLowerCase())
  );
  return {
    hasPanDoc: set.has('pan'),
    hasAadhaarDoc: set.has('aadhaar'),
    hasPhotoDoc: set.has('photo')
  };
}

/** Valid PAN & 12-digit Aadhaar on profile; PAN, Aadhaar, and photo documents uploaded. */
export function isCustomerKycComplete(
  pan: string | null | undefined,
  aadhaar: string | null | undefined,
  docTypes: Iterable<string>
): boolean {
  const { hasPanDoc, hasAadhaarDoc, hasPhotoDoc } = customerHasKycDocs(docTypes);
  return (
    isPanValid(pan ?? '') &&
    isAadhaarValid(aadhaar ?? '') &&
    hasPanDoc &&
    hasAadhaarDoc &&
    hasPhotoDoc
  );
}

export function maskAadhaarLast4(value: string | null | undefined): string {
  const d = normalizeAadhaar(value ?? '');
  return d.length === 12 ? `XXXX-XXXX-${d.slice(-4)}` : '—';
}
