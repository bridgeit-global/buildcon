import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { BOOKING_DOCUMENT_KIND_LABEL } from '@/lib/booking/booking-generated-doc-kind';

export type NotificationRecipient = {
  fullName: string;
  email: string | null;
  phoneE164Digits: string | null;
};

export type NotificationDocumentContext = {
  kind: BookingDocumentPrintKind;
  docLabel: string;
  signedUrl: string;
  signedUrlValidDays: number;
  fileName: string;
  unitCode?: string | null;
  projectName?: string | null;
};

export type WhatsappTemplateSpec = {
  name: string;
  languageCode: string;
  /** Body component parameters in declared order. */
  bodyParams: string[];
  /** Filename surfaced in WhatsApp document header. */
  headerFilename: string;
};

export type EmailTemplateSpec = {
  subject: string;
  html: string;
};

/**
 * Env-overridable template names per document kind. WABA templates must be
 * approved in Meta Business Manager with a document header and body params:
 *   {{1}} = customer name
 *   {{2}} = doc label (e.g. "Allotment letter")
 *   {{3}} = unit code (or "your unit")
 *   {{4}} = link validity in days
 */
function templateNameFor(kind: BookingDocumentPrintKind): string {
  const env = process.env;
  const map: Record<BookingDocumentPrintKind, string> = {
    'application-form':
      env.WHATSAPP_TEMPLATE_APPLICATION_FORM ?? 'buildcon_application_form',
    'allotment-letter':
      env.WHATSAPP_TEMPLATE_ALLOTMENT_LETTER ?? 'buildcon_allotment_letter',
    receipt: env.WHATSAPP_TEMPLATE_RECEIPT ?? 'buildcon_payment_receipt',
    'demand-letter': env.WHATSAPP_TEMPLATE_DEMAND_LETTER ?? 'buildcon_demand_letter',
    agreement: env.WHATSAPP_TEMPLATE_AGREEMENT ?? 'buildcon_sale_agreement',
    'registration-deed':
      env.WHATSAPP_TEMPLATE_REGISTRATION_DEED ?? 'buildcon_registration_deed',
    'possession-letter':
      env.WHATSAPP_TEMPLATE_POSSESSION_LETTER ?? 'buildcon_possession_letter'
  };
  return map[kind];
}

export function buildWhatsappTemplateSpec(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext
): WhatsappTemplateSpec {
  return {
    name: templateNameFor(doc.kind),
    languageCode: process.env.WHATSAPP_DEFAULT_LANGUAGE_CODE ?? 'en',
    bodyParams: [
      recipient.fullName || 'Customer',
      doc.docLabel,
      doc.unitCode ?? 'your unit',
      String(doc.signedUrlValidDays)
    ],
    headerFilename: doc.fileName
  };
}

export function buildEmailTemplateSpec(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext
): EmailTemplateSpec {
  const safeName = escapeHtml(recipient.fullName || 'Customer');
  const safeLabel = escapeHtml(doc.docLabel);
  const safeUnit = doc.unitCode ? escapeHtml(doc.unitCode) : null;
  const safeProject = doc.projectName ? escapeHtml(doc.projectName) : null;

  const projectLine = safeProject ? `<p>Project: <strong>${safeProject}</strong></p>` : '';
  const unitLine = safeUnit ? `<p>Unit: <strong>${safeUnit}</strong></p>` : '';

  const html = `<p>Dear ${safeName},</p>
<p>Your <strong>${safeLabel}</strong> is ready.</p>
${projectLine}${unitLine}
<p><a href="${doc.signedUrl}">Download document</a> (link valid for ${doc.signedUrlValidDays} days).</p>
<p>Please reach out to us if you have any questions.</p>
<p>— BuildCon</p>`;

  return {
    subject: `${doc.docLabel} — ready to download`,
    html
  };
}

export function getDocLabelForKind(kind: BookingDocumentPrintKind): string {
  return BOOKING_DOCUMENT_KIND_LABEL[kind] ?? 'Booking document';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
