import { PRINT_FONT_FAMILY } from '@/lib/booking/print-font-family';
import type { DocumentTemplateKind } from '@/lib/document-template/kinds';
import { DOCUMENT_TEMPLATE_KIND_LABEL } from '@/lib/document-template/kinds';

function wrapSample(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: ${PRINT_FONT_FAMILY}; color: #111; margin: 24px; line-height: 1.45; }
    h1 { font-size: 18pt; margin: 0 0 12px; }
    .muted { color: #555; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 10pt; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Starter HTML for each uploadable document kind (placeholders use {{key}}). */
export const DOCUMENT_TEMPLATE_SAMPLES: Record<DocumentTemplateKind, string> = {
  'application-form': wrapSample(
    'Application form',
    `  <h1>Application form</h1>
  <p class="muted">Form no. {{application.form_no}} · Generated {{generated_at}}</p>
  <p><strong>Project:</strong> {{project.name}} ({{project.location}})</p>
  <p><strong>Unit:</strong> {{unit.line}}</p>
  <p><strong>Booking amount:</strong> {{booking.amount_inr}}</p>
  <p><strong>Token:</strong> {{application.token_date}} · {{application.token_reference}}</p>
  <p><strong>Loan:</strong> {{application.loan_from_bank}} {{application.preferred_bank}}</p>
  <table>
    <thead>
      <tr><th>#</th><th>Applicant</th><th>Mobile</th><th>Address</th></tr>
    </thead>
    <tbody>
      {{application.applicants_html}}
    </tbody>
  </table>`
  ),
  'allotment-letter': wrapSample(
    'Allotment letter',
    `  <h1>Allotment letter</h1>
  <p class="muted">Ref {{allotment.ref}} · Date {{allotment.date}}</p>
  <p>Dear {{customer.name}},</p>
  <p>
    We are pleased to allot <strong>{{unit.line}}</strong> in
    <strong>{{project.name}}</strong> ({{project.location}}) against booking
    <strong>{{booking.display_id}}</strong> for {{booking.amount_inr}}.
  </p>
  <p>Address: {{customer.address}}</p>
  <p>Co-buyers: {{customer.co_buyers}}</p>
  <p class="muted">Generated {{generated_at}}</p>`
  ),
  agreement: wrapSample(
    'Draft sale agreement',
    `  <h1>Draft sale agreement</h1>
  <p class="muted">{{booking.display_id}} · {{generated_at}}</p>
  <p>
    This draft agreement is between the promoter of <strong>{{project.name}}</strong>
    and <strong>{{customer.name}}</strong> for unit <strong>{{unit.line}}</strong>
    at {{project.location}}, consideration {{booking.amount_inr}}.
  </p>
  <p>Payment mode: {{booking.payment_mode}}</p>
  <p>Co-buyers: {{customer.co_buyers}}</p>`
  ),
  'registration-deed': wrapSample(
    'Registration deed',
    `  <h1>Registration deed (record copy)</h1>
  <p class="muted">{{booking.display_id}} · {{generated_at}}</p>
  <p>
    Registration record for <strong>{{unit.line}}</strong> in
    <strong>{{project.name}}</strong> allotted to <strong>{{customer.name}}</strong>
    ({{customer.address}}).
  </p>
  <p>Consideration: {{booking.amount_inr}}</p>`
  ),
  'demand-letter': wrapSample(
    'Demand letter',
    `  <h1>Demand letter</h1>
  <p class="muted">{{booking.display_id}} · {{generated_at}}</p>
  <p>Dear {{customer.name}},</p>
  <p>
    Please pay <strong>{{demand.amount_inr}}</strong> for
    <strong>{{demand.instalment_label}}</strong> towards
    <strong>{{unit.line}}</strong> at <strong>{{project.name}}</strong>
    on or before <strong>{{demand.due_date}}</strong>.
  </p>
  <p class="muted">Booking amount: {{booking.amount_inr}}</p>`
  )
};

export function sampleTemplateFileName(kind: DocumentTemplateKind): string {
  return `${kind}-template.html`;
}

export function sampleTemplateDownloadName(kind: DocumentTemplateKind): string {
  return `${DOCUMENT_TEMPLATE_KIND_LABEL[kind].replace(/\s+/g, '-').toLowerCase()}-template.html`;
}
