import {
  computeBookingCostBreakdown,
  type ProjectParkingMeta,
  type ProjectPricingMeta,
  type UnitCostInput
} from '@/app/crm/booking-cost-utils';
import { formatInrCompactLacCr } from '@/app/crm/inr-format';
import {
  display,
  esc,
  formatPrintDate,
  sharedStyles
} from '@/lib/booking/booking-receipt-demand-agreement-print';

export type CostSheetPrintInput = {
  unit: UnitCostInput;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  projectParking: ProjectParkingMeta | null;
  projectPricing?: ProjectPricingMeta | null;
  applyDefaultGst?: boolean;
  customerName?: string | null;
  generatedAt?: Date;
};

function rowsTable(
  title: string,
  rows: readonly (readonly [string, string])[]
): string {
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`
    )
    .join('');
  return `<h2 class="section-title">${esc(title)}</h2>
<table class="details"><tbody>${body}</tbody></table>`;
}

export function buildCostSheetHtml(input: CostSheetPrintInput): string {
  const at = input.generatedAt ?? new Date();
  const slotRate =
    input.projectParking?.parking_rate != null &&
    input.projectParking.parking_rate > 0
      ? input.projectParking.parking_rate
      : 0;
  const breakdown = computeBookingCostBreakdown(
    input.unit,
    input.parkingRequired,
    input.parkingCount,
    slotRate,
    input.projectParking,
    input.projectPricing ?? undefined,
    {
      applyDefaultGst:
        (input.applyDefaultGst ?? true) &&
        !input.projectPricing?.gst_registered
    }
  );

  const project = display(input.unit.project_name, 'Project');
  const customer = display(input.customerName, 'Customer');
  const totalLabel =
    breakdown.grandTotalInr > 0
      ? formatInrCompactLacCr(breakdown.grandTotalInr)
      : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cost sheet — ${esc(input.unit.unit_code)}</title>
  <style>
    ${sharedStyles()}
    .total-banner {
      margin: 16px 0 20px;
      padding: 12px 14px;
      border: 1px solid #2563eb;
      background: #eff6ff;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .total-banner strong { font-size: 13pt; color: #1e40af; }
    .section-title {
      margin: 18px 0 8px;
      font-size: 10pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="doc">
    <p class="brand">BuildCon</p>
    <p class="doc-title">Cost sheet</p>
    <div class="meta">
      <span><strong>Unit:</strong> ${esc(input.unit.unit_code)}</span>
      <span><strong>Date:</strong> ${esc(formatPrintDate(at))}</span>
    </div>
    <p class="para">Prepared for <strong>${esc(customer)}</strong></p>
    <p class="para"><strong>${esc(project)}</strong> · ${esc(input.unit.wing_name || '—')}</p>
    <div class="total-banner">
      <span>Estimated total</span>
      <strong>${esc(totalLabel)}</strong>
    </div>
    ${rowsTable('Unit details', breakdown.specRows)}
    ${rowsTable('Pricing & charges', breakdown.pricingRows)}
    <p class="muted">
      Estimate only. Stamp duty, registration, and other statutory charges follow project
      settings where configured. Confirm final numbers on the formal quotation or agreement.
    </p>
  </div>
</body>
</html>`;
}
