import { z } from 'zod';
import {
  bookingPaymentModeField,
  paymentModeNeedsLoanBank
} from '@/lib/booking/booking-payment';
import {
  isPhoneLengthValidForCountry,
  optionalEmail,
  phoneLengthErrorMessage,
  positiveNumberString
} from '@/lib/form/common-fields';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';

export { zodFieldErrors } from '@/lib/form/zod-field-errors';

const positiveInrAmount = positiveNumberString('booking amount');

/** Inline “add customer” on the bookings page */
export const bookingQuickCustomerSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Customer name is required.'),
    phone: z.string(),
    phoneCountry: z.string().default(DEFAULT_COUNTRY_DIAL_CODE_OPTION),
    email: optionalEmail
  })
  .superRefine((data, ctx) => {
    if (!isPhoneLengthValidForCountry(data.phone, data.phoneCountry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: phoneLengthErrorMessage(data.phoneCountry)
      });
    }
  });

export type BookingQuickCustomerValues = z.infer<typeof bookingQuickCustomerSchema>;

export const bookingCreateSchema = z
  .object({
    unitId: z.string().trim().min(1, 'Select a unit.'),
    customerId: z.string().trim().min(1, 'Select a customer.'),
    paymentMode: bookingPaymentModeField,
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
