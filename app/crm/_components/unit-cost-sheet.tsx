'use client';

import { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sendInquiryCostSheetWithToasts } from '@/lib/inquiry/notify-inquiry-cost-sheet';
import {
  computeBookingCostBreakdown,
  type ProjectParkingMeta,
  type ProjectPricingMeta,
  type UnitCostInput
} from '../booking-cost-utils';
import { formatInrCompactLacCr } from '../inr-format';
import { BookingCostRows } from './booking-cost-rows';

export type CostSheetSendContext = {
  inquiryId: string;
  unitId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  disabled?: boolean;
  disabledReason?: string;
};

type UnitCostSheetProps = {
  unit: UnitCostInput;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  projectParking: ProjectParkingMeta | null;
  projectPricing?: ProjectPricingMeta | null;
  /** When project has no GST config, show 5% GST estimate on dwelling (inquiry / quotation). */
  applyDefaultGst?: boolean;
  className?: string;
  sendContext?: CostSheetSendContext | null;
};

export function UnitCostSheet({
  unit,
  parkingRequired,
  parkingCount,
  projectParking,
  projectPricing = null,
  applyDefaultGst = true,
  className,
  sendContext = null
}: UnitCostSheetProps) {
  const [sending, setSending] = useState(false);

  const breakdown = useMemo(() => {
    const slotRate =
      projectParking?.parking_rate != null && projectParking.parking_rate > 0
        ? projectParking.parking_rate
        : 0;
    return computeBookingCostBreakdown(
      unit,
      parkingRequired,
      parkingCount,
      slotRate,
      projectParking,
      projectPricing ?? undefined,
      {
        applyDefaultGst:
          applyDefaultGst && !projectPricing?.gst_registered
      }
    );
  }, [
    unit,
    parkingRequired,
    parkingCount,
    projectParking,
    projectPricing,
    applyDefaultGst
  ]);

  const projectLabel = String(unit.project_name || '').trim();

  const sendDisabledReason = useMemo(() => {
    if (!sendContext) return null;
    if (sendContext.disabled && sendContext.disabledReason) {
      return sendContext.disabledReason;
    }
    if (!String(sendContext.inquiryId || '').trim()) {
      return 'Save enquiry details first to send the cost sheet.';
    }
    if (
      !String(sendContext.customerPhone || '').trim() &&
      !String(sendContext.customerEmail || '').trim()
    ) {
      return 'Add customer mobile or email before sending.';
    }
    if (sendContext.disabled) return 'Sending is disabled for this enquiry.';
    return null;
  }, [sendContext]);

  async function handleSendCostSheet() {
    if (!sendContext || sendDisabledReason || sending) return;
    setSending(true);
    try {
      await sendInquiryCostSheetWithToasts(sendContext.inquiryId, {
        unitId: sendContext.unitId,
        parkingRequired,
        parkingCount,
        customerName: sendContext.customerName,
        customerEmail: sendContext.customerEmail,
        customerPhone: sendContext.customerPhone
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-gray-100 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ds-gray-500">
            Cost sheet
          </p>
          <h3 className="mt-0.5 text-base font-bold text-ds-gray-900">
            {unit.unit_code}
          </h3>
          <p className="mt-0.5 text-xs text-ds-gray-600">
            {projectLabel ? `${projectLabel} · ` : ''}
            {unit.wing_name || '—'}
          </p>
        </div>
        {breakdown.grandTotalInr > 0 ? (
          <div className="rounded-lg bg-ds-primary-50 px-3 py-2 text-right ring-1 ring-ds-primary-100">
            <p className="text-[10px] font-semibold uppercase text-ds-primary-700">
              Est. total
            </p>
            <p className="text-sm font-bold text-ds-primary-800">
              {formatInrCompactLacCr(breakdown.grandTotalInr)}
            </p>
          </div>
        ) : null}
      </div>

      <section className="mt-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ds-gray-500">
          Unit details
        </h4>
        <BookingCostRows
          rows={breakdown.specRows}
          layout="two-column"
          rowVariant="muted"
        />
      </section>

      <section className="mt-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ds-gray-500">
          Pricing & charges
        </h4>
        <BookingCostRows
          rows={breakdown.pricingRows}
          layout="two-column"
          rowVariant="elevated"
        />
      </section>

      <p className="mt-3 text-[10px] leading-relaxed text-ds-gray-500">
        Estimate only. Stamp duty, registration, and other statutory charges
        follow project settings where configured. Confirm final numbers on the
        formal quotation or agreement.
      </p>

      {sendContext ? (
        <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-ds-gray-100 pt-4">
          <Button
            type="button"
            size="sm"
            className="min-h-10 w-full gap-1.5"
            disabled={Boolean(sendDisabledReason) || sending}
            title={sendDisabledReason ?? undefined}
            onClick={() => void handleSendCostSheet()}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {sending ? 'Sending…' : 'Send cost sheet'}
          </Button>
          <p className="text-[11px] text-ds-gray-500">
            {sendDisabledReason ??
              'Sends the PDF to the customer via email, SMS, and WhatsApp (when configured).'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
