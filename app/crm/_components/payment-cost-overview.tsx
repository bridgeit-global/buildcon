import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BookingFinancialTotal } from '../booking-financial-total';
import { formatBookingAmountInr } from '../booking-financial-total';
import { formatInrCompactLacCr } from '../inr-format';
import { BookingCostRows } from './booking-cost-rows';

export type PaymentCostOverviewMode = 'inquiry' | 'standard';

type PaymentCostOverviewProps = {
  mode: PaymentCostOverviewMode;
  /** Usually `${unit_code} · ${wing_name}` */
  unitHeadline: string;
  rows: readonly (readonly [string, string])[];
  bookingAmount: number;
  /** When negotiation sets the final deal value (vs catalog estimate). */
  financialTotal?: BookingFinancialTotal | null;
  /** e.g. inquiry unit vs picker mismatch */
  alert?: ReactNode;
  className?: string;
};

function OverviewDescription({ mode }: { mode: PaymentCostOverviewMode }) {
  if (mode === 'inquiry') {
    return (
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-ds-gray-600">
        Agreement line items, parking from the inquiry where applicable, GST (5%)
        on basic value, and totals. Negotiated price is the final deal value when
        set. The booking token you enter below is collected now and becomes the
        first milestone (&quot;Booking Amount&quot;) in the payment schedule.
      </p>
    );
  }
  return (
    <p className="mt-1 max-w-xl text-xs leading-relaxed text-ds-gray-600">
      Sale area × basic rate, GST (5%) on basic value, and project parking
      availability. The booking token you enter below is collected now and
      becomes the first milestone (&quot;Booking Amount&quot;) in the payment
      schedule.
    </p>
  );
}

function FinancialTotalSummary({
  summary
}: {
  summary: BookingFinancialTotal;
}) {
  const hasDiscount =
    summary.discountInr != null && summary.discountInr > 0;

  return (
    <div className="mt-4 rounded-lg border border-ds-primary-200 bg-ds-primary-50/60 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ds-primary-800">
        Financial total (agreed)
      </div>
      <div className="mt-2 space-y-2 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-ds-gray-600">Catalog total (est.)</span>
          <span className="font-semibold tabular-nums text-ds-gray-900">
            {formatBookingAmountInr(summary.catalogTotalInr)}
          </span>
        </div>
        {hasDiscount ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-ds-gray-600">Negotiation discount</span>
            <span className="font-semibold tabular-nums text-ds-primary-700">
              − {formatInrCompactLacCr(summary.discountInr!)}
              {summary.discountPct != null
                ? ` (${summary.discountPct}%)`
                : ''}
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-ds-primary-200/80 pt-2">
          <span className="font-semibold text-ds-gray-800">Final amount</span>
          <span className="text-base font-bold tabular-nums text-ds-primary-800">
            {formatBookingAmountInr(summary.financialTotalInr)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ds-gray-600">
        Negotiated price is the agreed deal value. Payment schedule demand uses
        this total.
      </p>
    </div>
  );
}

export function PaymentCostOverview({
  mode,
  unitHeadline,
  rows,
  bookingAmount,
  financialTotal,
  alert,
  className
}: PaymentCostOverviewProps) {
  const showFinancial =
    financialTotal?.negotiatedPriceInr != null &&
    financialTotal.negotiatedPriceInr > 0;

  return (
    <div
      className={cn(
        'mt-4 rounded-xl border border-border bg-muted/90 p-4 shadow-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Payment &amp; cost overview
          </div>
          <OverviewDescription mode={mode} />
        </div>
      </div>
      {alert}
      <div className="mt-3 text-sm font-semibold text-foreground">
        {unitHeadline}
      </div>
      <BookingCostRows
        className="mt-3"
        rows={rows}
        layout="two-column"
        rowVariant="elevated"
      />
      {showFinancial && financialTotal ? (
        <FinancialTotalSummary summary={financialTotal} />
      ) : null}
      <div className="mt-4 rounded-lg border border-dashed border-border bg-card px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Due at booking (token)
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-xs leading-relaxed text-ds-gray-600">
            Enter the amount you are collecting at booking confirmation. Edit the
            field below if needed.
          </p>
          <div className="text-xl font-bold tabular-nums text-ds-success-700">
            ₹
            {Number(bookingAmount || 0).toLocaleString('en-IN', {
              maximumFractionDigits: 0
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
