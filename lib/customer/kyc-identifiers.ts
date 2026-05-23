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

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
] as const;

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
] as const;

function passesVerhoeffChecksum(digits: string): boolean {
  let checksum = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = Number(reversed[i]);
    if (!Number.isInteger(digit)) return false;
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[i % 8][digit]!]!;
  }
  return checksum === 0;
}

export function isAadhaarValid(aadhaar: string): boolean {
  const d = normalizeAadhaar(aadhaar);
  if (d.length !== 12) return false;
  if (/^[01]/.test(d)) return false;
  return passesVerhoeffChecksum(d);
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
