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
 * Plain SMS for push.json. Returns null unless SMS_DOCUMENT_MESSAGE is set to text
 * approved on SMS Alert/DLT (login OTP template cannot be reused for other wording).
 */
export function buildSmsPlainText(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext
): string | null {
  const custom = process.env.SMS_DOCUMENT_MESSAGE?.trim();
  if (!custom) return null;

  return applySmsPlaceholders(custom, recipient, doc);
}

function applySmsPlaceholders(
  template: string,
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext
): string {
  const name = recipient.fullName || 'Customer';
  const mobile = recipient.phoneE164Digits?.replace(/\D/g, '').slice(-10) ?? '';
  const unit = doc.unitCode ?? '';
  const project = doc.projectName ?? '';
  return template
    .replaceAll('{mobile}', mobile)
    .replaceAll('{name}', name)
    .replaceAll('{doc}', doc.docLabel)
    .replaceAll('{url}', doc.signedUrl)
    .replaceAll('{days}', String(doc.signedUrlValidDays))
    .replaceAll('{unit}', unit)
    .replaceAll('{project}', project);
}

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
