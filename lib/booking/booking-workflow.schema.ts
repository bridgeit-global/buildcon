import { z } from 'zod';
import { paymentModeNeedsLoanBank } from '@/lib/booking/booking-payment';
import { positiveNumberString } from '@/lib/form/common-fields';
import { kycIdentitySchema } from '@/lib/customer/customer-forms.schema';

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

export const bookingBuyerKycSchema = kycIdentitySchema;

export const bookingCancelSchema = z.object({
  cancelReason: z.string().trim().min(1, 'Select a cancellation reason.')
});

export type BookingTokenStageValues = z.infer<typeof bookingTokenStageSchema>;
export type BookingApplicationValues = z.infer<typeof bookingApplicationSchema>;
export type BookingAllotmentValues = z.infer<typeof bookingAllotmentSchema>;
export type BookingBuyerKycValues = z.infer<typeof bookingBuyerKycSchema>;
export type BookingCancelValues = z.infer<typeof bookingCancelSchema>;
