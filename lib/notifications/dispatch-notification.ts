import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseKindFromBookingGeneratedPath } from '@/lib/booking/booking-generated-doc-kind';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import {
  buildEmailTemplateSpec,
  buildSmsPlainText,
  buildWhatsappTemplateSpec,
  getDocLabelForKind,
  type NotificationDocumentContext,
  type NotificationRecipient
} from './notification-templates';
import {
  getSmtpConfig,
  sendSmtpEmail,
  type SmtpSendResult
} from './nodemailer-email';
import {
  buildWaMeShareUrl,
  getWhatsappCloudConfig,
  phoneToWaDigits,
  sendWhatsappTemplateDocument,
  type WhatsappSendResult
} from './meta-cloud-whatsapp';
import {
  getSmsAlertConfig,
  phoneToSmsMobileNo,
  sendSmsAlertPlainText,
  type SmsSendResult
} from './smsalert-sms';

const SIGNED_URL_VALID_DAYS = 7;
const SIGNED_URL_VALID_SECONDS = SIGNED_URL_VALID_DAYS * 24 * 60 * 60;

export type DispatchChannelResult = {
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId: string | null;
  error: string | null;
  skippedReason: string | null;
};

export type DispatchNotificationResult = {
  ok: boolean;
  docLabel: string;
  signedUrl: string | null;
  email: DispatchChannelResult;
  sms: DispatchChannelResult;
  whatsapp: DispatchChannelResult & { fallbackShareUrl: string | null };
  error?: string;
};

export type DispatchNotificationOpts = {
  /** When true, generates a wa.me share URL even when Cloud API is configured. */
  preferShareLink?: boolean;
  /** When true, suppresses email send. */
  skipEmail?: boolean;
  /** When true, suppresses SMS send. */
  skipSms?: boolean;
  /** When true, suppresses WhatsApp send. */
  skipWhatsapp?: boolean;
};

/** Dispatches a generated document to the linked customer over email, SMS, and WhatsApp. */
export async function dispatchGeneratedDocumentNotification(
  admin: SupabaseClient,
  generatedDocumentId: string,
  opts?: DispatchNotificationOpts
): Promise<DispatchNotificationResult> {
  const gen = await loadGeneratedDocument(admin, generatedDocumentId);
  if (!gen.ok) {
    return failureShell(gen.error);
  }

  const docKind = parseKindFromBookingGeneratedPath(gen.row.storage_path);
  const docLabel = docKind ? getDocLabelForKind(docKind) : 'Booking document';

  const signed = await signDownloadUrl(admin, gen.row.storage_path);
  if (!signed.ok) {
    return failureShell(signed.error, docLabel);
  }

  const customer = await loadCustomer(admin, gen.row.customer_id);
  const unitInfo = await loadUnitContext(admin, gen.row.booking_id);

  const recipient: NotificationRecipient = {
    fullName: customer?.full_name?.trim() || 'Customer',
    email: (customer?.email ?? '').trim() || null,
    phoneE164Digits: phoneToWaDigits(customer?.phone ?? null)
  };

  const docCtx: NotificationDocumentContext = {
    kind: (docKind ?? 'receipt') as BookingDocumentPrintKind,
    docLabel,
    signedUrl: signed.url,
    signedUrlValidDays: SIGNED_URL_VALID_DAYS,
    fileName: extractFileName(gen.row.storage_path) ?? `${docLabel}.pdf`,
    unitCode: unitInfo?.unit_code ?? null,
    projectName: unitInfo?.project_name ?? null
  };

  return dispatchDocumentToRecipient(
    admin,
    {
      generatedDocumentId,
      projectId: gen.row.project_id,
      bookingId: gen.row.booking_id,
      unitId: unitInfo?.unit_id ?? null,
      customerId: gen.row.customer_id,
      recipient,
      docCtx,
      customerPhoneRaw: customer?.phone ?? null
    },
    opts
  );
}

export type DispatchDocumentToRecipientInput = {
  generatedDocumentId: string;
  projectId: string;
  bookingId: string | null;
  unitId: string | null;
  customerId: string | null;
  recipient: NotificationRecipient;
  docCtx: NotificationDocumentContext;
  customerPhoneRaw?: string | null;
};

/** Sends a signed document to a recipient over email, SMS, and WhatsApp. */
export async function dispatchDocumentToRecipient(
  admin: SupabaseClient,
  input: DispatchDocumentToRecipientInput,
  opts?: DispatchNotificationOpts
): Promise<DispatchNotificationResult> {
  const { recipient, docCtx } = input;

  const emailResult = opts?.skipEmail
    ? skipped('Email channel disabled for this dispatch.')
    : await sendEmailChannel(recipient, docCtx);

  const smsResult = opts?.skipSms
    ? skipped('SMS channel disabled for this dispatch.')
    : await sendSmsChannel(recipient, docCtx, input.customerPhoneRaw ?? null);

  const whatsappResult = opts?.skipWhatsapp
    ? { ...skipped('WhatsApp channel disabled for this dispatch.'), fallbackShareUrl: null }
    : await sendWhatsappChannel(recipient, docCtx, opts?.preferShareLink ?? false);

  await persistChannelOutcome(admin, {
    generatedDocumentId: input.generatedDocumentId,
    projectId: input.projectId,
    bookingId: input.bookingId,
    unitId: input.unitId,
    customerId: input.customerId,
    templateName: null,
    channel: 'email',
    provider: 'smtp',
    recipient: recipient.email,
    result: emailResult
  });

  await persistChannelOutcome(admin, {
    generatedDocumentId: input.generatedDocumentId,
    projectId: input.projectId,
    bookingId: input.bookingId,
    unitId: input.unitId,
    customerId: input.customerId,
    templateName: null,
    channel: 'sms',
    provider: 'smsalert',
    recipient: phoneToSmsMobileNo(input.customerPhoneRaw ?? null),
    result: smsResult
  });

  await persistChannelOutcome(admin, {
    generatedDocumentId: input.generatedDocumentId,
    projectId: input.projectId,
    bookingId: input.bookingId,
    unitId: input.unitId,
    customerId: input.customerId,
    templateName: buildWhatsappTemplateSpec(recipient, docCtx).name,
    channel: 'whatsapp',
    provider: 'meta_cloud',
    recipient: recipient.phoneE164Digits,
    result: whatsappResult
  });

  return {
    ok:
      emailResult.status !== 'failed' &&
      smsResult.status !== 'failed' &&
      whatsappResult.status !== 'failed',
    docLabel: docCtx.docLabel,
    signedUrl: docCtx.signedUrl,
    email: emailResult,
    sms: smsResult,
    whatsapp: whatsappResult
  };
}

async function sendEmailChannel(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext
): Promise<DispatchChannelResult> {
  if (!getSmtpConfig()) {
    return skipped(
      'Set SMTP_HOST and CRM_DOCUMENTS_EMAIL_FROM (and SMTP_USER/SMTP_PASS when required) to send email automatically.'
    );
  }
  if (!recipient.email) {
    return skipped('Customer has no email on file.');
  }
  const tpl = buildEmailTemplateSpec(recipient, doc);
  const res: SmtpSendResult = await sendSmtpEmail({
    to: recipient.email,
    subject: tpl.subject,
    html: tpl.html
  });
  if (res.ok) {
    return {
      status: 'sent',
      providerMessageId: res.providerMessageId,
      error: null,
      skippedReason: null
    };
  }
  if ('skipped' in res && res.skipped) {
    return skipped(res.reason);
  }
  return {
    status: 'failed',
    providerMessageId: null,
    error: res.error,
    skippedReason: null
  };
}

async function sendSmsChannel(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext,
  phoneRaw: string | null
): Promise<DispatchChannelResult> {
  if (!getSmsAlertConfig()) {
    return skipped('Set SMS_API_KEY to send SMS automatically.');
  }
  const mobileNo = phoneToSmsMobileNo(phoneRaw);
  if (!mobileNo) {
    return skipped('Customer has no valid 10-digit mobile number on file.');
  }
  const text = buildSmsPlainText(recipient, doc);
  if (!text) {
    return skipped(
      'Set SMS_DOCUMENT_MESSAGE to the exact SMS Alert/DLT-approved text for document alerts (sender PKAEPL). ' +
      'Do not include download URLs. Placeholders: {mobile}, {name}, {doc}, {days}. ' +
      'Your login OTP template only allows that OTP wording — register a separate document template on smsalert.co.in.'
    );
  }
  const res: SmsSendResult = await sendSmsAlertPlainText({ mobileNo, text });
  if (res.ok) {
    return {
      status: 'sent',
      providerMessageId: res.providerMessageId,
      error: null,
      skippedReason: null
    };
  }
  if ('skipped' in res && res.skipped) {
    return skipped(res.reason);
  }
  return {
    status: 'failed',
    providerMessageId: null,
    error: res.error,
    skippedReason: null
  };
}

async function sendWhatsappChannel(
  recipient: NotificationRecipient,
  doc: NotificationDocumentContext,
  preferShareLink: boolean
): Promise<DispatchChannelResult & { fallbackShareUrl: string | null }> {
  const cfg = getWhatsappCloudConfig();
  const phone = recipient.phoneE164Digits;

  const fallbackShareUrl = phone
    ? buildWaMeShareUrl(
      phone,
      `Hello ${recipient.fullName},\n\nYour ${doc.docLabel} from BuildCon is ready.\nDownload (link valid ${doc.signedUrlValidDays} days): ${doc.signedUrl}\n\n— BuildCon CRM`
    )
    : null;

  if (!phone) {
    const s = skipped('Customer has no usable mobile number on file.');
    return { ...s, fallbackShareUrl };
  }
  if (!cfg || preferShareLink) {
    const reason = !cfg
      ? 'WhatsApp Cloud API not configured — use the share link instead.'
      : 'Manual share link requested.';
    const s = skipped(reason);
    return { ...s, fallbackShareUrl };
  }

  const tpl = buildWhatsappTemplateSpec(recipient, doc);
  const res: WhatsappSendResult = await sendWhatsappTemplateDocument({
    toDigits: phone,
    templateName: tpl.name,
    languageCode: tpl.languageCode,
    headerDocumentUrl: doc.signedUrl,
    headerDocumentFilename: tpl.headerFilename,
    bodyParams: tpl.bodyParams
  });
  if (res.ok) {
    return {
      status: 'sent',
      providerMessageId: res.providerMessageId,
      error: null,
      skippedReason: null,
      fallbackShareUrl
    };
  }
  if ('skipped' in res && res.skipped) {
    return { ...skipped(res.reason), fallbackShareUrl };
  }
  return {
    status: 'failed',
    providerMessageId: null,
    error: res.error,
    skippedReason: null,
    fallbackShareUrl
  };
}

async function loadGeneratedDocument(
  admin: SupabaseClient,
  id: string
): Promise<
  | {
    ok: true;
    row: {
      id: string;
      project_id: string;
      booking_id: string | null;
      customer_id: string | null;
      storage_path: string;
    };
  }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from('generated_documents')
    .select('id,project_id,booking_id,customer_id,storage_path')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Generated document not found' };
  return {
    ok: true,
    row: {
      id: data.id as string,
      project_id: data.project_id as string,
      booking_id: (data.booking_id ?? null) as string | null,
      customer_id: (data.customer_id ?? null) as string | null,
      storage_path: data.storage_path as string
    }
  };
}

async function signDownloadUrl(
  admin: SupabaseClient,
  storagePath: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const bucket = storagePath.startsWith('documents/') ? 'documents' : null;
  if (!bucket) {
    return {
      ok: false,
      error: 'Generated document is not stored in the documents bucket.'
    };
  }
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_VALID_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Could not sign download URL' };
  }
  return { ok: true, url: data.signedUrl };
}

async function loadCustomer(
  admin: SupabaseClient,
  customerId: string | null
): Promise<{ full_name: string | null; email: string | null; phone: string | null } | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from('customers')
    .select('full_name,email,phone')
    .eq('id', customerId)
    .maybeSingle();
  if (!data) return null;
  return {
    full_name: (data.full_name as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null
  };
}

async function loadUnitContext(
  admin: SupabaseClient,
  bookingId: string | null
): Promise<{ unit_id: string | null; unit_code: string | null; project_name: string | null } | null> {
  if (!bookingId) return null;
  const { data } = await admin
    .from('bookings')
    .select('unit_id, units(unit_code), projects(name)')
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;
  const unitRel = (data as { units?: unknown }).units;
  const projRel = (data as { projects?: unknown }).projects;
  const unit = Array.isArray(unitRel) ? unitRel[0] : unitRel;
  const project = Array.isArray(projRel) ? projRel[0] : projRel;
  return {
    unit_id: ((data as { unit_id?: unknown }).unit_id as string | null) ?? null,
    unit_code:
      unit && typeof unit === 'object' && 'unit_code' in unit
        ? ((unit as { unit_code?: unknown }).unit_code as string | null) ?? null
        : null,
    project_name:
      project && typeof project === 'object' && 'name' in project
        ? ((project as { name?: unknown }).name as string | null) ?? null
        : null
  };
}

async function persistChannelOutcome(
  admin: SupabaseClient,
  input: {
    generatedDocumentId: string;
    projectId: string;
    bookingId: string | null;
    unitId: string | null;
    customerId: string | null;
    templateName: string | null;
    channel: 'email' | 'whatsapp' | 'sms';
    provider: 'resend' | 'smtp' | 'meta_cloud' | 'smsalert';
    recipient: string | null;
    result: DispatchChannelResult;
  }
): Promise<void> {
  const baseRow = {
    project_id: input.projectId,
    booking_id: input.bookingId,
    unit_id: input.unitId,
    customer_id: input.customerId,
    generated_document_id: input.generatedDocumentId,
    channel: input.channel,
    provider: input.provider,
    template_name: input.templateName,
    recipient: input.recipient,
    status: input.result.status,
    provider_message_id: input.result.providerMessageId,
    error: input.result.error ?? input.result.skippedReason ?? null,
    processed_at: new Date().toISOString()
  };

  const { data: existing } = await admin
    .from('outbound_notifications')
    .select('id, attempts')
    .eq('generated_document_id', input.generatedDocumentId)
    .eq('channel', input.channel)
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from('outbound_notifications')
      .update({
        ...baseRow,
        attempts: ((existing.attempts as number | null) ?? 0) + 1
      })
      .eq('id', existing.id);
  } else {
    await admin
      .from('outbound_notifications')
      .insert({ ...baseRow, attempts: 1 });
  }
}

function extractFileName(storagePath: string): string | null {
  const parts = storagePath.split('/');
  const file = parts[parts.length - 1] ?? '';
  return file || null;
}

function skipped(reason: string): DispatchChannelResult {
  return {
    status: 'skipped',
    providerMessageId: null,
    error: null,
    skippedReason: reason
  };
}

function failureShell(error: string, docLabel = 'Booking document'): DispatchNotificationResult {
  const failed: DispatchChannelResult = {
    status: 'failed',
    providerMessageId: null,
    error,
    skippedReason: null
  };
  return {
    ok: false,
    docLabel,
    signedUrl: null,
    email: failed,
    sms: failed,
    whatsapp: { ...failed, fallbackShareUrl: null },
    error
  };
}
