import { z } from 'zod';
import { normalizePhoneDigits } from '@/lib/customer/customer-forms.schema';
import { paymentModeNeedsLoanBank } from '@/lib/booking/booking-payment';

const optionalEmail = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  },
  { message: 'Enter a valid email address.' }
);

const positiveInrAmount = z.string().refine(
  (v) => {
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) && n > 0;
  },
  { message: 'Enter a positive booking amount.' }
);

/** Inline “add customer” on the bookings page */
export const bookingQuickCustomerSchema = z.object({
  full_name: z.string().trim().min(1, 'Customer name is required.'),
  phone: z
    .string()
    .refine((v) => normalizePhoneDigits(v).length === 10, {
      message: 'Enter a 10-digit phone number.'
    }),
  email: optionalEmail
});

export type BookingQuickCustomerValues = z.infer<typeof bookingQuickCustomerSchema>;

export const bookingCreateSchema = z
  .object({
    unitId: z.string().trim().min(1, 'Select a unit.'),
    customerId: z.string().trim().min(1, 'Select a customer.'),
    paymentMode: z.string().trim().min(1, 'Select a payment mode.'),
    loanBank: z.string(),
    upiUtr: z.string(),
    chequeNo: z.string(),
    neftRef: z.string(),
    bookingAmount: positiveInrAmount
  })
  .superRefine((data, ctx) => {
    if (paymentModeNeedsLoanBank(data.paymentMode) && !data.loanBank.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['loanBank'],
        message: 'Select the loan or sanctioning bank.'
      });
    }
    if (data.paymentMode === 'UPI' && !data.upiUtr.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['upiUtr'],
        message: 'Enter UPI UTR.'
      });
    }
    if (data.paymentMode === 'Cheque' && !data.chequeNo.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['chequeNo'],
        message: 'Enter cheque number.'
      });
    }
    if (data.paymentMode === 'NEFT/RTGS' && !data.neftRef.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['neftRef'],
        message: 'Enter NEFT / RTGS reference.'
      });
    }
  });

export type BookingCreateFormValues = z.infer<typeof bookingCreateSchema>;

export function zodFieldErrors<T extends string>(
  result: z.ZodSafeParseResult<unknown>
): Partial<Record<T, string>> {
  if (result.success) return {};
  const out: Partial<Record<T, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) {
      out[key as T] = issue.message;
    }
  }
  return out;
}
