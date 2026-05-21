import 'server-only';

export type ResendSendInput = {
  to: string;
  subject: string;
  html: string;
};

export type ResendSendResult =
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

export type ResendConfig = {
  apiKey: string;
  from: string;
};

export function getResendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CRM_DOCUMENTS_EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  const cfg = getResendConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Set RESEND_API_KEY and CRM_DOCUMENTS_EMAIL_FROM to send email automatically.'
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
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [input.to],
        subject: input.subject,
        html: input.html
      })
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const errMsg =
        (typeof json === 'object' &&
          json !== null &&
          'message' in (json as Record<string, unknown>) &&
          String((json as Record<string, unknown>).message ?? '')) ||
        res.statusText ||
        'Resend request failed';
      return { ok: false, error: errMsg, response: json };
    }

    const providerMessageId =
      typeof json === 'object' &&
      json !== null &&
      'id' in (json as Record<string, unknown>)
        ? String((json as Record<string, unknown>).id ?? '') || null
        : null;

    return { ok: true, providerMessageId, response: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Resend request failed'
    };
  }
}
