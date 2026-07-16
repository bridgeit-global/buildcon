import {
  isAadhaarValid,
  isPanValid,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

/** PAN pattern with optional spaces/hyphens between groups. */
const PAN_LOOSE_RE = /\b([A-Za-z]{5})\s*[-]?\s*([0-9]{4})\s*[-]?\s*([A-Za-z])\b/g;

/** 12-digit runs, optionally grouped as 4-4-4. */
const AADHAAR_GROUPED_RE = /\b(\d{4})\s*[-]?\s*(\d{4})\s*[-]?\s*(\d{4})\b/g;
const AADHAAR_PLAIN_RE = /\b(\d{12})\b/g;

function looksMasked(segment: string): boolean {
  return /x/i.test(segment);
}

/**
 * Extract the first valid PAN from OCR text.
 * Skips masked placeholders (e.g. XXXXX1234X).
 */
export function extractPanFromText(text: string): string | null {
  const raw = String(text ?? '');
  PAN_LOOSE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAN_LOOSE_RE.exec(raw)) !== null) {
    if (looksMasked(m[0])) continue;
    const pan = normalizePan(`${m[1]}${m[2]}${m[3]}`);
    if (isPanValid(pan)) return pan;
  }
  // Fallback: strip noise and scan sliding 10-char windows of alphanumerics
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i <= compact.length - 10; i++) {
    const slice = compact.slice(i, i + 10);
    if (looksMasked(slice)) continue;
    if (isPanValid(slice)) return normalizePan(slice);
  }
  return null;
}

function firstAadhaarInSegment(segment: string): string | null {
  AADHAAR_GROUPED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AADHAAR_GROUPED_RE.exec(segment)) !== null) {
    if (looksMasked(m[0])) continue;
    const digits = normalizeAadhaar(`${m[1]}${m[2]}${m[3]}`);
    if (isAadhaarValid(digits)) return digits;
  }

  AADHAAR_PLAIN_RE.lastIndex = 0;
  while ((m = AADHAAR_PLAIN_RE.exec(segment)) !== null) {
    if (looksMasked(m[0])) continue;
    const digits = normalizeAadhaar(m[1]!);
    if (isAadhaarValid(digits)) return digits;
  }
  return null;
}

/**
 * Extract the first valid 12-digit Aadhaar from OCR text.
 * Skips masked groups (e.g. XXXX XXXX 1234) by blanking X-runs before match,
 * and scans line-by-line so a trailing last-4 does not glue onto the next line.
 */
export function extractAadhaarFromText(text: string): string | null {
  const raw = String(text ?? '');
  const scrubbed = raw.replace(/x{2,}/gi, ' ');
  for (const line of scrubbed.split(/\r?\n/)) {
    const found = firstAadhaarInSegment(line);
    if (found) return found;
  }
  if (!scrubbed.includes('\n') && !scrubbed.includes('\r')) {
    return firstAadhaarInSegment(scrubbed);
  }
  // Last resort: full scrubbed text (handles soft line breaks as spaces).
  return firstAadhaarInSegment(scrubbed.replace(/\s+/g, ' '));
}
