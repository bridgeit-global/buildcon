import { z } from 'zod';
import { paymentModeNeedsLoanBank } from '@/lib/booking/booking-payment';
import { positiveNumberString } from '@/lib/form/common-fields';
import {
  isAadhaarValid,
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
  allotment_date: z.string().trim().min(1, 'Enter allotment date.')
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

/** Blur-time PAN check — no “required” while empty; format only when 10 chars entered. */
export function parseBookingBuyerPanBlurError(pan_number: string): string | undefined {
  const panNorm = normalizePan(pan_number);
  if (!panNorm || panNorm.length < 10) return undefined;
  if (!isPanValid(panNorm)) {
    return 'Enter a valid PAN (e.g. ABCDE1234F).';
  }
  return undefined;
}

/** Blur-time Aadhaar check — no error until all 12 digits are entered. */
export function parseBookingBuyerAadhaarBlurError(
  aadhaar_last4: string
): string | undefined {
  const raw = String(aadhaar_last4 ?? '').replace(/\D/g, '');
  if (!raw || raw.length < 12) return undefined;
  if (!isAadhaarValid(raw)) {
    return 'Enter a valid 12-digit Aadhaar number.';
  }
  return undefined;
}

export const bookingCancelSchema = z.object({
  cancelReason: z.string().trim().min(1, 'Select a cancellation reason.')
});

export type BookingTokenStageValues = z.infer<typeof bookingTokenStageSchema>;
export type BookingApplicationValues = z.infer<typeof bookingApplicationSchema>;
export type BookingAllotmentValues = z.infer<typeof bookingAllotmentSchema>;
export type BookingBuyerKycValues = z.infer<typeof bookingBuyerKycSchema>;
export type BookingCancelValues = z.infer<typeof bookingCancelSchema>;
