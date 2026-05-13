import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BookingCostRows } from './booking-cost-rows';

export type PaymentCostOverviewMode = 'inquiry' | 'standard';

type PaymentCostOverviewProps = {
  mode: PaymentCostOverviewMode;
  /** Usually `${unit_code} · ${wing_name}` */
  unitHeadline: string;
  rows: readonly (readonly [string, string])[];
  bookingAmount: number;
  /** e.g. inquiry unit vs picker mismatch */
  alert?: ReactNode;
  className?: string;
};

function OverviewDescription({ mode }: { mode: PaymentCostOverviewMode }) {
  if (mode === 'inquiry') {
    return (
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
        Agreement line items, parking from the inquiry where applicable, GST (5%)
        on basic value, and totals. The booking token you enter below is collected
        now and becomes the first milestone (&quot;Booking Amount&quot;) in the
        payment schedule.
      </p>
    );
  }
  return (
    <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
      Sale area × basic rate, GST (5%) on basic value, and project parking
      availability. The booking token you enter below is collected now and
      becomes the first milestone (&quot;Booking Amount&quot;) in the payment
      schedule.
    </p>
  );
}

export function PaymentCostOverview({
  mode,
  unitHeadline,
  rows,
  bookingAmount,
  alert,
  className
}: PaymentCostOverviewProps) {
  return (
    <div
      className={cn(
        'mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Payment &amp; cost overview
          </div>
          <OverviewDescription mode={mode} />
        </div>
      </div>
      {alert}
      <div className="mt-3 text-sm font-semibold text-slate-900">
        {unitHeadline}
      </div>
      <BookingCostRows
        className="mt-3"
        rows={rows}
        layout="two-column"
        rowVariant="elevated"
      />
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Due at booking (token)
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-xs leading-relaxed text-slate-600">
            Enter the amount you are collecting at booking confirmation. Edit the
            field below if needed.
          </p>
          <div className="text-xl font-bold tabular-nums text-emerald-700">
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
