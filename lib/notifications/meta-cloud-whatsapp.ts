import 'server-only';

export type WhatsappCloudConfig = {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
};

export type WhatsappDocumentSendInput = {
  /** E.164 digits-only without leading "+" (Meta Cloud format). */
  toDigits: string;
  templateName: string;
  languageCode: string;
  headerDocumentUrl: string;
  headerDocumentFilename: string;
  bodyParams: string[];
};

export type WhatsappSendResult =
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

export function getWhatsappCloudConfig(): WhatsappCloudConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION ?? 'v20.0'
  };
}

/** Sends a WABA template message with a document header. Body params map to {{1}}..{{N}}. */
export async function sendWhatsappTemplateDocument(
  input: WhatsappDocumentSendInput
): Promise<WhatsappSendResult> {
  const cfg = getWhatsappCloudConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to send WhatsApp automatically.'
    };
  }

  if (!input.toDigits) {
    return {
      ok: false,
      skipped: true,
      reason: 'Customer has no usable mobile number on file.'
    };
  }

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${encodeURIComponent(
    cfg.phoneNumberId
  )}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: input.toDigits,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                link: input.headerDocumentUrl,
                filename: input.headerDocumentFilename
              }
            }
          ]
        },
        ...(input.bodyParams.length > 0
          ? [
              {
                type: 'body',
                parameters: input.bodyParams.map((value) => ({
                  type: 'text',
                  text: value
                }))
              }
            ]
          : [])
      ]
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const errObj =
        typeof json === 'object' && json !== null
          ? (json as Record<string, unknown>).error
          : null;
      const errMsg =
        (errObj && typeof errObj === 'object' && 'message' in errObj
          ? String((errObj as Record<string, unknown>).message ?? '')
          : '') ||
        res.statusText ||
        'WhatsApp request failed';
      return { ok: false, error: errMsg, response: json };
    }

    const providerMessageId = extractMessageId(json);
    return { ok: true, providerMessageId, response: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'WhatsApp request failed'
    };
  }
}

function extractMessageId(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const messages = (json as Record<string, unknown>).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const first = messages[0];
  if (!first || typeof first !== 'object') return null;
  const id = (first as Record<string, unknown>).id;
  return id ? String(id) : null;
}

/** Normalize phone to E.164 digits (assumes IN-default for 10-digit input). */
export function phoneToWaDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = `91${d}`;
  if (d.length < 10) return null;
  return d;
}

/** Builds a wa.me share fallback URL when no WABA template is configured. */
export function buildWaMeShareUrl(toDigits: string, message: string): string {
  return `https://wa.me/${toDigits}?text=${encodeURIComponent(message)}`;
}
