import { z } from 'zod';
import { positiveNumberString } from '@/lib/form/common-fields';

function parseOfferedInr(raw: string): number {
  return Number(String(raw).replace(/,/g, '').trim());
}

/** Cap offered price to unit agreement total (area × rate + floor rise + PLC). */
function offeredPriceUnitCapRefine(
  unitTotalInr: number | null | undefined
) {
  return (data: { offeredPrice: string }, ctx: z.RefinementCtx) => {
    const max = Number(unitTotalInr);
    if (!Number.isFinite(max) || max <= 0) return;
    const offered = parseOfferedInr(data.offeredPrice);
    if (!Number.isFinite(offered) || offered <= 0) return;
    if (offered > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['offeredPrice'],
        message: `Offered price cannot exceed the unit agreement total (₹ ${max.toLocaleString('en-IN')}).`
      });
    }
  };
}

export const negotiationOfferSchema = z.object({
  offeredPrice: positiveNumberString('offered price')
});

export const negotiationApprovalRequestSchema = z.object({
  offeredPrice: positiveNumberString('offered price'),
  requestNote: z.string()
});

export function negotiationOfferSchemaWithUnitCap(
  unitTotalInr: number | null | undefined
) {
  return negotiationOfferSchema.superRefine(
    offeredPriceUnitCapRefine(unitTotalInr)
  );
}

export function negotiationApprovalRequestSchemaWithUnitCap(
  unitTotalInr: number | null | undefined
) {
  return negotiationApprovalRequestSchema.superRefine(
    offeredPriceUnitCapRefine(unitTotalInr)
  );
}

export const inquiryCloseSchema = z.object({
  closeReason: z.string().trim().min(1, 'Select a close reason.')
});

export type NegotiationOfferValues = z.infer<typeof negotiationOfferSchema>;
