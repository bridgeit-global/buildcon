import { z } from 'zod';
import { paymentModeNeedsLoanBank } from '@/lib/booking/booking-payment';
import { positiveNumberString } from '@/lib/form/common-fields';
import {
  isAadhaarValid,
  isPanPrefixValid,
  isPanValid,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

export const bookingTokenStageSchema = z
  .object({
    amount: positiveNumberString('token amount'),
    date: z.string().trim().min(1, 'Enter token date.'),
    mode: z.string().trim().min(1, 'Select payment mode.')
  })
  .superRefine((data, ctx) => {
    if (paymentModeNeedsLoanBank(data.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mode'],
        message: 'Loan bank must be set on the booking for this payment mode.'
      });
    }
  });

export const bookingApplicationSchema = z.object({
  occupation: z.string(),
  address_line1: z.string().trim().min(1, 'Enter correspondence address.')
});

export const bookingAllotmentSchema = z.object({
  allotment_date: z.string().trim().min(1, 'Enter allotment date.'),
  allotment_letter_ref: z.string().optional()
});

/** PAN & 12-digit Aadhaar required when saving buyer IDs on a booking. */
export const bookingBuyerKycSchema = z
  .object({
    pan_number: z.string(),
    aadhaar_last4: z.string()
  })
  .superRefine((data, ctx) => {
    const panNorm = normalizePan(data.pan_number);
    if (!panNorm) {
      ctx.addIssue({
        code: 'custom',
        path: ['pan_number'],
        message: 'PAN is required.'
      });
    } else if (!isPanValid(panNorm)) {
      ctx.addIssue({
        code: 'custom',
        path: ['pan_number'],
        message: 'Enter a valid PAN (e.g. ABCDE1234F).'
      });
    }
    const aadhaarRaw = String(data.aadhaar_last4 ?? '').trim();
    if (!aadhaarRaw) {
      ctx.addIssue({
        code: 'custom',
        path: ['aadhaar_last4'],
        message: 'Aadhaar number is required.'
      });
    } else if (!isAadhaarValid(aadhaarRaw)) {
      ctx.addIssue({
        code: 'custom',
        path: ['aadhaar_last4'],
        message: 'Enter a valid 12-digit Aadhaar number.'
      });
    }
  });

export type BookingBuyerKycFieldErrors = {
  pan?: string;
  aadhaar?: string;
};

export function parseBookingBuyerKycFieldErrors(values: {
  pan_number: string;
  aadhaar_last4: string;
}): BookingBuyerKycFieldErrors | null {
  const parsed = bookingBuyerKycSchema.safeParse(values);
  if (parsed.success) return null;
  const fieldErrors: BookingBuyerKycFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (key === 'pan_number') fieldErrors.pan = issue.message;
    if (key === 'aadhaar_last4') fieldErrors.aadhaar = issue.message;
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

/** Inline PAN validation while typing: required, prefix/format, then length. */
export function parseBookingBuyerPanInlineError(pan_number: string): string | undefined {
  const panNorm = normalizePan(pan_number);
  if (!panNorm) return 'PAN is required.';
  if (!isPanPrefixValid(panNorm)) {
    return 'Enter a valid PAN (e.g. ABCDE1234F).';
  }
  if (panNorm.length < 10) return 'PAN must be 10 characters.';
  if (!isPanValid(panNorm)) {
    return 'Enter a valid PAN (e.g. ABCDE1234F).';
  }
  return undefined;
}

/** Inline Aadhaar validation while typing: required, length, then checksum. */
export function parseBookingBuyerAadhaarInlineError(
  aadhaar_last4: string
): string | undefined {
  const raw = String(aadhaar_last4 ?? '').replace(/\D/g, '');
  if (!raw) return 'Aadhaar number is required.';
  if (/^[01]/.test(raw)) {
    return 'Enter a valid 12-digit Aadhaar number.';
  }
  if (raw.length < 12) return 'Aadhaar must be 12 digits.';
  if (!isAadhaarValid(raw)) {
    return 'Enter a valid 12-digit Aadhaar number.';
  }
  return undefined;
}

/** @deprecated Use {@link parseBookingBuyerPanInlineError}. */
export const parseBookingBuyerPanBlurError = parseBookingBuyerPanInlineError;

/** @deprecated Use {@link parseBookingBuyerAadhaarInlineError}. */
export const parseBookingBuyerAadhaarBlurError = parseBookingBuyerAadhaarInlineError;

/** @deprecated Use {@link parseBookingBuyerPanInlineError}. */
export const parseBookingBuyerPanChangeError = parseBookingBuyerPanInlineError;

/** @deprecated Use {@link parseBookingBuyerAadhaarInlineError}. */
export const parseBookingBuyerAadhaarChangeError = parseBookingBuyerAadhaarInlineError;

export const bookingCancelSchema = z.object({
  cancelReason: z.string().trim().min(1, 'Select a cancellation reason.')
});

export type BookingTokenStageValues = z.infer<typeof bookingTokenStageSchema>;
export type BookingApplicationValues = z.infer<typeof bookingApplicationSchema>;
export type BookingAllotmentValues = z.infer<typeof bookingAllotmentSchema>;
export type BookingBuyerKycValues = z.infer<typeof bookingBuyerKycSchema>;
export type BookingCancelValues = z.infer<typeof bookingCancelSchema>;
