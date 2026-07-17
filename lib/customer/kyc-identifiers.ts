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

/** Passport: uppercase alphanumeric, max 12 (strip spaces/hyphens). */
export function normalizePassport(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

/** Indian passport: one letter + seven digits (e.g. K1234567). */
export function isIndianPassportValid(passport: string): boolean {
  const p = normalizePassport(passport);
  return /^[A-Z][0-9]{7}$/.test(p);
}

/** Foreign passport: 6–12 alphanumeric characters. */
export function isForeignPassportValid(passport: string): boolean {
  const p = normalizePassport(passport);
  return p.length >= 6 && p.length <= 12 && /^[A-Z0-9]+$/.test(p);
}

export function passportValidationMessage(
  residentialStatus?: string | null
): string {
  const s = String(residentialStatus ?? '').trim().toLowerCase();
  if (s === 'nri') {
    return 'Enter a valid Indian passport number (e.g. K1234567).';
  }
  if (s === 'foreign national') {
    return 'Enter a valid passport number (6–12 letters and digits).';
  }
  return 'Enter a valid passport number.';
}

export function isPassportValid(
  passport: string,
  residentialStatus?: string | null
): boolean {
  const p = normalizePassport(passport);
  if (!p) return false;
  const s = String(residentialStatus ?? '').trim().toLowerCase();
  if (s === 'nri') return isIndianPassportValid(p);
  if (s === 'foreign national') return isForeignPassportValid(p);
  return isIndianPassportValid(p) || isForeignPassportValid(p);
}

/** True while each typed character matches the expected passport structure. */
export function isPassportPrefixValid(
  passport: string,
  residentialStatus?: string | null
): boolean {
  const p = normalizePassport(passport);
  if (!p) return true;
  const s = String(residentialStatus ?? '').trim().toLowerCase();
  if (s === 'nri') {
    for (let i = 0; i < p.length; i++) {
      const c = p[i]!;
      if (i === 0) {
        if (!/[A-Z]/.test(c)) return false;
      } else if (!/[0-9]/.test(c)) {
        return false;
      }
    }
    return p.length <= 8;
  }
  return /^[A-Z0-9]+$/.test(p) && p.length <= 12;
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
