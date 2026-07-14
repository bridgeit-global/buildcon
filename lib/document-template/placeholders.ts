import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import {
  esc,
  formatInr,
  unitLine,
  type BookingSalesDocPrintBase
} from '@/lib/booking/booking-receipt-demand-agreement-print';
import { brandHeaderHtml } from '@/lib/booking/print-brand-header';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { formatDisplayDate } from '@/lib/format-display-date';
import {
  buildApplicantRows,
  formatCustomerAddress,
  pickCustomerAddress
} from '@/lib/customer/application-form-data';
import type { CoBuyerStored } from '@/app/crm/bookings/booking-types';

export type DocumentTemplatePlaceholderDef = {
  key: string;
  description: string;
};

/** Placeholders available in uploaded HTML templates (`{{key}}`). */
export const DOCUMENT_TEMPLATE_PLACEHOLDERS: DocumentTemplatePlaceholderDef[] = [
  { key: 'organization.trade_name', description: 'Builder / developer trade name' },
  { key: 'organization.signatory', description: 'Authorised signatory name' },
  { key: 'organization.logo_html', description: 'Brand logo + trade name header HTML' },
  { key: 'project.name', description: 'Project name' },
  { key: 'project.location', description: 'Project location' },
  { key: 'customer.name', description: 'Primary buyer name' },
  { key: 'customer.address', description: 'Primary buyer current address' },
  { key: 'customer.co_buyers', description: 'Co-buyer names (comma-separated)' },
  { key: 'unit.code', description: 'Unit code' },
  { key: 'unit.wing', description: 'Wing name' },
  { key: 'unit.floor', description: 'Floor number' },
  { key: 'unit.type', description: 'Unit type' },
  { key: 'unit.line', description: 'Unit summary line' },
  { key: 'booking.id', description: 'Booking UUID' },
  { key: 'booking.display_id', description: 'Display booking id (BK-YYYY-XXXXXX)' },
  { key: 'booking.amount', description: 'Booking amount (raw number)' },
  { key: 'booking.amount_inr', description: 'Booking amount formatted as INR' },
  { key: 'booking.created_at', description: 'Booking created date' },
  { key: 'booking.workflow_stage', description: 'Workflow stage' },
  { key: 'booking.payment_mode', description: 'Payment mode' },
  { key: 'payment.received_amount', description: 'Received amount (receipt overrides)' },
  { key: 'payment.received_amount_inr', description: 'Received amount as INR' },
  { key: 'payment.received_at', description: 'Payment received date' },
  { key: 'payment.reference', description: 'Payment reference' },
  { key: 'payment.mode', description: 'Payment mode (override or booking)' },
  { key: 'demand.instalment_label', description: 'Demand instalment / milestone label' },
  { key: 'demand.amount', description: 'Demand amount (raw)' },
  { key: 'demand.amount_inr', description: 'Demand amount as INR' },
  { key: 'demand.due_date', description: 'Demand due date' },
  { key: 'allotment.ref', description: 'Allotment letter reference' },
  { key: 'allotment.date', description: 'Allotment date' },
  { key: 'application.form_no', description: 'Application form number' },
  { key: 'application.token_date', description: 'Token payment date' },
  { key: 'application.token_reference', description: 'Token payment reference' },
  { key: 'application.loan_from_bank', description: 'Yes/No if loan from bank' },
  { key: 'application.preferred_bank', description: 'Preferred bank name' },
  { key: 'application.applicants_html', description: 'HTML table rows for applicants' },
  { key: 'generated_at', description: 'Document generation date' }
];

function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function display(v: string | number | null | undefined, fallback = '—'): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function salesBaseFromPack(
  pack: BookingPrintPack,
  overrides?: BookingDocumentHtmlOverrides
): BookingSalesDocPrintBase {
  const booking = pack.booking;
  const unit = unwrapJoin(booking.units);
  const customer = unwrapJoin(booking.customers);
  const co = (booking.co_buyers ?? []) as CoBuyerStored[];
  return {
    bookingId: booking.id,
    bookingCreatedAt: booking.created_at,
    projectName: pack.projectName,
    projectLocation: pack.projectLocation,
    unitCode: unit?.unit_code ?? null,
    wingName: unit?.wing_name ?? null,
    floor: unit?.floor ?? null,
    unitType: unit?.unit_type ?? null,
    customerName: customer?.full_name ?? null,
    coBuyerNames: co.map((c) => c.full_name).filter(Boolean),
    bookingAmount: booking.booking_amount,
    workflowStage: booking.workflow_stage,
    paymentMode: pack.stageData.token?.mode ?? booking.payment_mode ?? null,
    developerName: pack.developerName,
    authorizedSignatoryName: pack.authorizedSignatoryName,
    logoDataUri: pack.logoDataUri,
    ...overrides
  };
}

function applicantsHtml(pack: BookingPrintPack): string {
  const buyers = pack.buyerKyc.map((b) => ({ id: b.customerId, label: b.label }));
  const applicants = buildApplicantRows(buyers, pack.buyerProfiles, pack.buyerAddresses);
  if (!applicants.length) return '<tr><td colspan="4">—</td></tr>';
  return applicants
    .map((a, i) => {
      return `<tr>
  <td>${esc(String(i + 1))}</td>
  <td>${esc(a.fullName || '—')}</td>
  <td>${esc(a.mobile || '—')}</td>
  <td>${esc(a.communicationAddress || '—')}</td>
</tr>`;
    })
    .join('\n');
}

/** Flat map of placeholder key → escaped string value for HTML substitution. */
export function buildDocumentTemplateValues(
  pack: BookingPrintPack,
  overrides?: BookingDocumentHtmlOverrides
): Record<string, string> {
  const base = salesBaseFromPack(pack, overrides);
  const booking = pack.booking;
  const customer = unwrapJoin(booking.customers);
  const primaryAddr = pickCustomerAddress(
    pack.buyerAddresses.get(booking.customer_id) ?? [],
    'current'
  );
  const generatedAt = overrides?.generatedAt ?? new Date();
  const coBuyers = (base.coBuyerNames ?? []).join(', ');

  const receivedAmount =
    overrides?.receivedAmount != null ? overrides.receivedAmount : base.bookingAmount;
  const paymentMode = overrides?.paymentMode ?? base.paymentMode;

  return {
    'organization.trade_name': esc(display(pack.developerName)),
    'organization.signatory': esc(
      display(pack.authorizedSignatoryName, 'Authorised signatory')
    ),
    'organization.logo_html': brandHeaderHtml({
      developerName: pack.developerName,
      logoDataUri: pack.logoDataUri
    }),
    'project.name': esc(display(base.projectName)),
    'project.location': esc(display(base.projectLocation)),
    'customer.name': esc(display(base.customerName ?? customer?.full_name)),
    'customer.address': esc(display(formatCustomerAddress(primaryAddr) || null)),
    'customer.co_buyers': esc(display(coBuyers || null)),
    'unit.code': esc(display(base.unitCode)),
    'unit.wing': esc(display(base.wingName)),
    'unit.floor': esc(display(base.floor != null ? String(base.floor) : null)),
    'unit.type': esc(display(base.unitType)),
    'unit.line': esc(unitLine(base)),
    'booking.id': esc(base.bookingId),
    'booking.display_id': esc(
      formatBookingDisplayId(base.bookingId, base.bookingCreatedAt)
    ),
    'booking.amount': esc(
      base.bookingAmount != null ? String(base.bookingAmount) : '—'
    ),
    'booking.amount_inr': esc(formatInr(base.bookingAmount)),
    'booking.created_at': esc(formatDisplayDate(base.bookingCreatedAt)),
    'booking.workflow_stage': esc(display(base.workflowStage)),
    'booking.payment_mode': esc(display(base.paymentMode)),
    'payment.received_amount': esc(
      receivedAmount != null ? String(receivedAmount) : '—'
    ),
    'payment.received_amount_inr': esc(formatInr(receivedAmount)),
    'payment.received_at': esc(formatDisplayDate(overrides?.receivedAt)),
    'payment.reference': esc(display(overrides?.paymentReference)),
    'payment.mode': esc(display(paymentMode)),
    'demand.instalment_label': esc(display(overrides?.instalmentLabel)),
    'demand.amount': esc(
      overrides?.demandAmount != null ? String(overrides.demandAmount) : '—'
    ),
    'demand.amount_inr': esc(formatInr(overrides?.demandAmount)),
    'demand.due_date': esc(formatDisplayDate(overrides?.demandDueDate)),
    'allotment.ref': esc(display(pack.stageData.allotment?.allotment_letter_ref)),
    'allotment.date': esc(formatDisplayDate(pack.stageData.allotment?.allotment_date)),
    'application.form_no': esc(base.bookingId),
    'application.token_date': esc(formatDisplayDate(pack.stageData.token?.date)),
    'application.token_reference': esc(display(pack.stageData.token?.reference)),
    'application.loan_from_bank': esc(booking.loan_bank ? 'Yes' : 'No'),
    'application.preferred_bank': esc(display(booking.loan_bank)),
    'application.applicants_html': applicantsHtml(pack),
    generated_at: esc(formatDisplayDate(generatedAt))
  };
}

/** Replace `{{key}}` placeholders. Unknown keys are left unchanged. */
export function applyDocumentTemplatePlaceholders(
  html: string,
  values: Record<string, string>
): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? '';
    }
    return match;
  });
}
