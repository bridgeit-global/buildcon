import { z } from 'zod';
import { positiveNumberString } from '@/lib/form/common-fields';

export const negotiationOfferSchema = z.object({
  offeredPrice: positiveNumberString('offered price')
});

export const negotiationApprovalRequestSchema = z.object({
  offeredPrice: positiveNumberString('offered price'),
  requestNote: z.string()
});

export const inquiryCloseSchema = z.object({
  closeReason: z.string().trim().min(1, 'Select a close reason.')
});

export type NegotiationOfferValues = z.infer<typeof negotiationOfferSchema>;
