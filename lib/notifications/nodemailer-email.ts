import 'server-only';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type SmtpSendInput = {
  to: string;
  subject: string;
  html: string;
};

export type SmtpSendResult =
  | {
      ok: true;
      providerMessageId: string | null;
      response: unknown;
    }
  | {
      ok: false;
      skipped: true;
      reason: string;
    }
  | {
      ok: false;
      skipped?: false;
      error: string;
      response?: unknown;
    };

export type SmtpConfig = {
  transport: SMTPTransport.Options;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.CRM_DOCUMENTS_EMAIL_FROM?.trim();
  if (!host || !from) return null;

  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 587;
  if (!Number.isFinite(port) || port <= 0) return null;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure =
    process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || port === 465;

  const transport: SMTPTransport.Options = {
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {})
  };

  return { transport, from };
}

export async function sendSmtpEmail(input: SmtpSendInput): Promise<SmtpSendResult> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Set SMTP_HOST and CRM_DOCUMENTS_EMAIL_FROM (and SMTP_USER/SMTP_PASS when required) to send email automatically.'
    };
  }

  if (!input.to) {
    return {
      ok: false,
      skipped: true,
      reason: 'Customer has no email on file.'
    };
  }

  try {
    const transporter = nodemailer.createTransport(cfg.transport);
    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      html: input.html
    });

    const providerMessageId =
      typeof info.messageId === 'string' && info.messageId.trim() ? info.messageId : null;

    return { ok: true, providerMessageId, response: info };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'SMTP send failed'
    };
  }
}
