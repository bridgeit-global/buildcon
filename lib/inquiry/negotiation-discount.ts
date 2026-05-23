import { computeNegotiationDiscount } from '@/app/crm/inquiry/inquiry-stage-transitions';

/** Maximum discount allowed on negotiation (agreement) price before admin approval. */
export const MAX_NEGOTIATION_DISCOUNT_PCT = 50;

export type NegotiationDiscountInput = {
  discountInrRaw?: string | number | null;
  discountPctRaw?: string | number | null;
};

export type NegotiationDiscountResolved = {
  discountInr: number | null;
  discountPct: number | null;
  offeredPrice: number | null;
};

function parsePositive(raw: string | number | null | undefined): number | null {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Resolve discount fields and implied offered price from list price. */
export function resolveNegotiationDiscount(
  listPriceInr: number | null | undefined,
  input: NegotiationDiscountInput
): NegotiationDiscountResolved {
  const listPrice = Number(listPriceInr);
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return { discountInr: null, discountPct: null, offeredPrice: null };
  }

  const inr = parsePositive(input.discountInrRaw);
  const pct = parsePositive(input.discountPctRaw);

  let discountInr: number | null = null;
  let discountPct: number | null = null;

  if (inr != null) {
    discountInr = Math.min(inr, listPrice);
    discountPct = Number(((discountInr / listPrice) * 100).toFixed(2));
  } else if (pct != null) {
    discountPct = Math.min(pct, 100);
    discountInr = Number(((listPrice * discountPct) / 100).toFixed(2));
  }

  if (discountInr == null || discountPct == null) {
    return { discountInr: null, discountPct: null, offeredPrice: listPrice };
  }

  const offeredPrice = Number((listPrice - discountInr).toFixed(2));
  return { discountInr, discountPct, offeredPrice };
}

export function isNegotiationDiscountOverCap(
  listPriceInr: number | null | undefined,
  input: NegotiationDiscountInput
): boolean {
  const resolved = resolveNegotiationDiscount(listPriceInr, input);
  return (
    resolved.discountPct != null &&
    resolved.discountPct > MAX_NEGOTIATION_DISCOUNT_PCT
  );
}

/** True when buyer terms differ from list (agreement) price — admin approval required. */
export function negotiationRequiresApproval(
  listPriceInr: number | null | undefined,
  negotiation: Record<string, unknown> | null | undefined
): boolean {
  if (!negotiation || typeof negotiation !== 'object' || Array.isArray(negotiation)) {
    return false;
  }
  const listPrice = Number(listPriceInr);
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    const offered = Number(String(negotiation.offered_price ?? '').trim());
    return Number.isFinite(offered) && offered > 0;
  }

  const resolved = resolveNegotiationDiscount(listPrice, {
    discountInrRaw: negotiation.discount_inr as string | number | null | undefined,
    discountPctRaw: negotiation.discount_pct as string | number | null | undefined
  });

  if (resolved.discountInr != null && resolved.discountInr > 0) return true;

  const offered = Number(String(negotiation.offered_price ?? '').trim());
  if (Number.isFinite(offered) && offered > 0 && offered < listPrice) return true;

  return false;
}

export function offeredPriceFromNegotiation(
  listPriceInr: number | null | undefined,
  negotiation: Record<string, unknown> | null | undefined
): string {
  const listPrice = Number(listPriceInr);
  const resolved = resolveNegotiationDiscount(listPrice, {
    discountInrRaw: negotiation?.discount_inr as string | number | null | undefined,
    discountPctRaw: negotiation?.discount_pct as string | number | null | undefined
  });
  if (resolved.offeredPrice != null) return String(resolved.offeredPrice);
  const legacy = String(negotiation?.offered_price ?? '').trim();
  if (legacy) return legacy;
  if (Number.isFinite(listPrice) && listPrice > 0) return String(listPrice);
  return '';
}

export function syncNegotiationDiscountFields(
  listPriceInr: number | null | undefined,
  negotiation: Record<string, unknown>
): Record<string, unknown> {
  const resolved = resolveNegotiationDiscount(listPriceInr, {
    discountInrRaw: negotiation.discount_inr as string | number | null | undefined,
    discountPctRaw: negotiation.discount_pct as string | number | null | undefined
  });
  const offered =
    resolved.offeredPrice != null
      ? String(resolved.offeredPrice)
      : String(negotiation.offered_price ?? '');
  const { discountPct } = computeNegotiationDiscount(listPriceInr, offered);
  return {
    ...negotiation,
    ...(resolved.discountInr != null
      ? { discount_inr: String(resolved.discountInr) }
      : {}),
    ...(discountPct != null ? { discount_pct: String(discountPct) } : {}),
    ...(offered ? { offered_price: offered } : {})
  };
}

export function negotiationFormLocked(
  negotiation: Record<string, unknown> | null | undefined
): boolean {
  if (!negotiation || typeof negotiation !== 'object' || Array.isArray(negotiation)) {
    return false;
  }
  const status = String(negotiation.approval_status ?? '').trim().toLowerCase();
  return status === 'approved' || status === 'pending';
}
