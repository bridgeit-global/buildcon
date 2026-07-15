import { esc, formatInr } from '@/lib/booking/booking-receipt-demand-agreement-print';
import { applyDocumentTemplatePlaceholders } from '@/lib/document-template/placeholders';

/** Demo values so admins can preview templates without a booking. */
export function buildDocumentTemplatePreviewValues(opts?: {
  projectName?: string | null;
}): Record<string, string> {
  const projectName = opts?.projectName?.trim() || 'Sunrise Heights';
  const amount = 7_500_000;
  const demandAmount = 375_000;

  return {
    'organization.trade_name': esc('BuildCon Developers Pvt Ltd'),
    'organization.signatory': esc('Authorised Signatory'),
    'organization.logo_html':
      '<div style="font-weight:700;font-size:14pt;margin-bottom:12px">BuildCon Developers Pvt Ltd</div>',
    'project.name': esc(projectName),
    'project.location': esc('Baner, Pune'),
    'customer.name': esc('Ravi Kumar'),
    'customer.address': esc('12 MG Road, Pune, Maharashtra 411001'),
    'customer.co_buyers': esc('Priya Kumar'),
    'unit.code': esc('A-101'),
    'unit.wing': esc('Tower A'),
    'unit.floor': esc('12'),
    'unit.type': esc('3 BHK'),
    'unit.line': esc('A-101 · Wing Tower A · Floor 12 · 3 BHK'),
    'booking.id': esc('00000000-0000-4000-8000-000000000001'),
    'booking.display_id': esc('BK-2026-000001'),
    'booking.amount': esc(String(amount)),
    'booking.amount_inr': esc(formatInr(amount)),
    'booking.created_at': esc('01-06-2026'),
    'booking.workflow_stage': esc('allotment'),
    'booking.payment_mode': esc('NEFT'),
    'payment.received_amount': esc(String(amount)),
    'payment.received_amount_inr': esc(formatInr(amount)),
    'payment.received_at': esc('01-06-2026'),
    'payment.reference': esc('NEFT-REF-12345'),
    'payment.mode': esc('NEFT'),
    'demand.instalment_label': esc('Slab 2 — Casting of 5th floor slab'),
    'demand.amount': esc(String(demandAmount)),
    'demand.amount_inr': esc(formatInr(demandAmount)),
    'demand.due_date': esc('15-07-2026'),
    'allotment.ref': esc('AL/2026/001'),
    'allotment.date': esc('10-06-2026'),
    'application.form_no': esc('AF-2026-001'),
    'application.token_date': esc('01-06-2026'),
    'application.token_reference': esc('TOKEN-9988'),
    'application.loan_from_bank': esc('Yes'),
    'application.preferred_bank': esc('HDFC Bank'),
    'application.applicants_html': `<tr>
  <td>1</td>
  <td>Ravi Kumar</td>
  <td>9876543210</td>
  <td>12 MG Road, Pune, Maharashtra 411001</td>
</tr>
<tr>
  <td>2</td>
  <td>Priya Kumar</td>
  <td>9123456780</td>
  <td>12 MG Road, Pune, Maharashtra 411001</td>
</tr>`,
    generated_at: esc('15-07-2026')
  };
}

/** Render template HTML with sample booking data for admin preview. */
export function renderDocumentTemplatePreviewHtml(
  templateBody: string,
  opts?: { projectName?: string | null }
): string {
  const body = templateBody.trim();
  if (!body) {
    return `<!DOCTYPE html><html><body><p style="font-family:sans-serif;color:#666;padding:24px">Empty template — add HTML to preview.</p></body></html>`;
  }
  return applyDocumentTemplatePlaceholders(
    body,
    buildDocumentTemplatePreviewValues(opts)
  );
}
