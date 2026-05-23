import { z } from 'zod';
import { positiveNumberString } from '@/lib/form/common-fields';
import { MAX_NEGOTIATION_DISCOUNT_PCT } from '@/lib/inquiry/negotiation-discount';

function parseInr(raw: string): number {
  return Number(String(raw).replace(/,/g, '').trim());
}

function discountRefine(
  unitTotalInr: number | null | undefined,
  mode: 'inr' | 'pct'
) {
  return (
    data: { discountInr: string; discountPct: string },
    ctx: z.RefinementCtx
  ) => {
    const list = Number(unitTotalInr);
    const raw = mode === 'inr' ? data.discountInr : data.discountPct;
    const value = parseInr(raw);
    if (!Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: [mode === 'inr' ? 'discountInr' : 'discountPct'],
        message:
          mode === 'inr'
            ? 'Enter a discount amount greater than zero.'
            : 'Enter a discount percentage greater than zero.'
      });
      return;
    }
    if (!Number.isFinite(list) || list <= 0) return;
    const maxDiscountInr = (list * MAX_NEGOTIATION_DISCOUNT_PCT) / 100;
    if (mode === 'inr' && value > list) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountInr'],
        message: `Discount cannot exceed list price (₹ ${list.toLocaleString('en-IN')}).`
      });
    }
    if (mode === 'inr' && value > maxDiscountInr) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountInr'],
        message: `Discount cannot exceed ${MAX_NEGOTIATION_DISCOUNT_PCT}% of list price (₹ ${maxDiscountInr.toLocaleString('en-IN')}).`
      });
    }
    if (mode === 'pct' && value > MAX_NEGOTIATION_DISCOUNT_PCT) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountPct'],
        message: `Discount cannot exceed ${MAX_NEGOTIATION_DISCOUNT_PCT}%.`
      });
    }
  };
}

export const negotiationDiscountApprovalSchema = z.object({
  discountInr: z.string(),
  discountPct: z.string(),
  requestNote: z.string()
});

export function negotiationDiscountApprovalSchemaWithUnitCap(
  unitTotalInr: number | null | undefined,
  mode: 'inr' | 'pct'
) {
  return negotiationDiscountApprovalSchema.superRefine(
    discountRefine(unitTotalInr, mode)
  );
}

/** @deprecated Use discount-based negotiation approval schema. */
export const negotiationOfferSchema = z.object({
  offeredPrice: positiveNumberString('offered price')
});

/** @deprecated Use discount-based negotiation approval schema. */
export const negotiationApprovalRequestSchema = z.object({
  offeredPrice: positiveNumberString('offered price'),
  requestNote: z.string()
});

export function negotiationOfferSchemaWithUnitCap(
  unitTotalInr: number | null | undefined
) {
  return negotiationOfferSchema;
}

export function negotiationApprovalRequestSchemaWithUnitCap(
  unitTotalInr: number | null | undefined
) {
  return negotiationApprovalRequestSchema;
}

export const inquiryCloseSchema = z.object({
  closeReason: z.string().trim().min(1, 'Select a close reason.')
});

export type NegotiationOfferValues = z.infer<typeof negotiationOfferSchema>;
