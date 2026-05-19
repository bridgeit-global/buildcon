import type { InquiryStageData } from './inquiry-types';

export type InquiryTokenStageData = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
  recorded_at?: string;
};

const INQUIRY_TOKEN_FIELDS = [
  'amount',
  'date',
  'mode',
  'reference',
  'notes',
  'recorded_at'
] as const;

function inquiryTokenFromStageData(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): InquiryTokenStageData | undefined {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return undefined;
  }
  const token = (stageData as InquiryStageData).token;
  if (!token || typeof token !== 'object' || Array.isArray(token)) return undefined;
  return token as InquiryTokenStageData;
}

export function isInquiryTokenComplete(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): boolean {
  const t = inquiryTokenFromStageData(stageData);
  if (!t) return false;
  if (!String(t.amount ?? '').trim()) return false;
  if (!String(t.date ?? '').trim()) return false;
  if (!String(t.mode ?? '').trim()) return false;
  return true;
}

/** Token officially captured on the enquiry pipeline. */
export function isInquiryTokenRecorded(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): boolean {
  const t = inquiryTokenFromStageData(stageData);
  if (String(t?.recorded_at ?? '').trim()) return true;
  return isInquiryTokenComplete(stageData);
}

export function inquiryTokenPayloadsEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  const left = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  const right = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  return INQUIRY_TOKEN_FIELDS.every(
    (key) => String(left[key] ?? '').trim() === String(right[key] ?? '').trim()
  );
}

/**
 * Token fields on an enquiry cannot change after recording or once a linked booking is confirmed.
 */
export function isInquiryTokenLocked(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined,
  options?: {
    inquiryClosed?: boolean;
    bookingConfirmed?: boolean;
  }
): boolean {
  if (options?.bookingConfirmed) return true;
  if (options?.inquiryClosed) return true;
  return isInquiryTokenRecorded(stageData);
}
