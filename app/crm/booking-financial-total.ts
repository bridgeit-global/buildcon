import { computeNegotiationDiscount } from './inquiry/inquiry-stage-transitions';
import { formatInrCompactLacCr } from './inr-format';
import type { InquiryStageData } from './inquiry/inquiry-types';

export type BookingFinancialTotal = {
  catalogTotalInr: number;
  negotiatedPriceInr: number | null;
  discountInr: number | null;
  discountPct: number | null;
  /** Negotiated price when set; otherwise catalog total. */
  financialTotalInr: number;
};

export function formatBookingAmountInr(inr: number): string {
  if (!Number.isFinite(inr) || inr <= 0) return '—';
  return `${formatInrCompactLacCr(inr)} (₹ ${Math.round(inr).toLocaleString('en-IN')})`;
}

/** Agreed / offered price from inquiry negotiation stage (final deal value). */
export function negotiatedPriceFromInquiryStage(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): number | null {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return null;
  }
  const neg = (stageData as InquiryStageData).negotiation;
  if (!neg || typeof neg !== 'object' || Array.isArray(neg)) return null;
  const offered = Number(String(neg.offered_price ?? '').trim());
  if (!Number.isFinite(offered) || offered <= 0) return null;
  return Math.round(offered);
}

export function resolveBookingFinancialTotal(
  catalogTotalInr: number,
  negotiatedPriceInr: number | null | undefined
): BookingFinancialTotal {
  const catalog = Math.max(0, Math.round(Number(catalogTotalInr) || 0));
  const negRaw =
    negotiatedPriceInr != null ? Number(negotiatedPriceInr) : Number.NaN;
  const negotiated =
    Number.isFinite(negRaw) && negRaw > 0 ? Math.round(negRaw) : null;

  if (!negotiated) {
    return {
      catalogTotalInr: catalog,
      negotiatedPriceInr: null,
      discountInr: null,
      discountPct: null,
      financialTotalInr: catalog
    };
  }

  const { discountInr, discountPct } = computeNegotiationDiscount(
    catalog,
    negotiated
  );

  return {
    catalogTotalInr: catalog,
    negotiatedPriceInr: negotiated,
    discountInr,
    discountPct,
    financialTotalInr: negotiated
  };
}

export function buildFinancialTotalDisplayRows(
  summary: BookingFinancialTotal
): [string, string][] {
  if (!summary.negotiatedPriceInr) return [];

  const rows: [string, string][] = [
    [
      'Catalog total (est.)',
      formatBookingAmountInr(summary.catalogTotalInr)
    ]
  ];

  if (summary.discountInr != null && summary.discountInr > 0) {
    const pct =
      summary.discountPct != null ? ` (${summary.discountPct}%)` : '';
    rows.push([
      'Negotiation discount',
      `− ${formatInrCompactLacCr(summary.discountInr)}${pct}`
    ]);
  }

  rows.push([
    'Financial total (agreed)',
    formatBookingAmountInr(summary.financialTotalInr)
  ]);

  return rows;
}
