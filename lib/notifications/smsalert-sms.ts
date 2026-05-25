import 'server-only';
import https from 'node:https';

export type SmsAlertConfig = {
  apiKey: string;
  sender: string;
  hostname: string;
};

export type SmsSendInput = {
  /** 10-digit Indian mobile (no country code). */
  mobileNo: string;
  text: string;
};

export type SmsSendResult =
  | {
    ok: true;
    providerMessageId: string | null;
    response: string;
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
    response?: string;
  };

const DEFAULT_HOSTNAME = 'www.smsalert.co.in';
const DEFAULT_SENDER = 'PKAEPL';

export function getSmsAlertConfig(): SmsAlertConfig | null {
  const apiKey = process.env.SMS_API_KEY?.trim();
  if (!apiKey) return null;

  const sender = process.env.SMS_SENDER?.trim() || DEFAULT_SENDER;
  const hostname = process.env.SMS_ALERT_HOSTNAME?.trim() || DEFAULT_HOSTNAME;

  return { apiKey, sender, hostname };
}

/** Normalize phone to 10-digit Indian mobile for SMS Alert `mobileno`. */
export function phoneToSmsMobileNo(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10) return null;
  return d;
}

/**
 * Plain-text SMS via SMS Alert push.json (same integration as BridgeIT OTP login).
 * @see https://www.smsalert.co.in — POST /api/push.json?apikey&sender&mobileno&text
 */
export async function sendSmsAlertPlainText(input: SmsSendInput): Promise<SmsSendResult> {
  const cfg = getSmsAlertConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: true,
      reason: 'Set SMS_API_KEY to send SMS automatically.'
    };
  }

  const mobileNo = phoneToSmsMobileNo(input.mobileNo) ?? input.mobileNo.replace(/\D/g, '');
  if (!mobileNo || mobileNo.length !== 10) {
    return {
      ok: false,
      skipped: true,
      reason: 'Recipient has no valid 10-digit mobile number.'
    };
  }

  // const message = input.text.trim();

  const message = `For your ID ${mobileNo}, please use the code 123456 to login on BridgeIT Application. Please do not share this code with anyone for security reason.`;
  if (!message) {
    return {
      ok: false,
      skipped: true,
      reason: 'SMS body is empty.'
    };
  }

  const encodedText = encodeURI(message);
  const path =
    `/api/push.json?apikey=${cfg.apiKey}` +
    `&sender=${cfg.sender}` +
    `&mobileno=${mobileNo}` +
    `&text=${encodedText}`;

  // #region agent log
  fetch('http://127.0.0.1:7394/ingest/83773395-73ed-477b-81a1-3fe21e6007e2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5fee9c' },
    body: JSON.stringify({
      sessionId: '5fee9c',
      runId: 'post-fix-2',
      hypothesisId: 'B,C',
      location: 'smsalert-sms.ts:sendSmsAlertPlainText:pre',
      message: 'SMS push request prepared',
      data: {
        mobileLast4: mobileNo.slice(-4),
        sender: cfg.sender,
        messageLen: message.length,
        encodedLen: encodedText.length,
        pathLen: path.length,
        skeleton: message.replace(/https?:\/\/\S+/gi, '[URL]').slice(0, 280)
      },
      timestamp: Date.now()
    })
  }).catch(() => { });
  // #endregion

  try {
    const { statusCode, body } = await smsAlertPushRequest(cfg.hostname, path);
    const parsed = parseSmsAlertResponse(body);

    // #region agent log
    fetch('http://127.0.0.1:7394/ingest/83773395-73ed-477b-81a1-3fe21e6007e2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5fee9c' },
      body: JSON.stringify({
        sessionId: '5fee9c',
        runId: 'post-fix-2',
        hypothesisId: 'A,E',
        location: 'smsalert-sms.ts:sendSmsAlertPlainText:post',
        message: 'SMS push response',
        data: {
          httpStatus: statusCode,
          parsedOk: parsed.ok,
          error: !parsed.ok ? parsed.error : null,
          bodyPreview: body.trim().slice(0, 200)
        },
        timestamp: Date.now()
      })
    }).catch(() => { });
    // #endregion

    if (!parsed.ok) {
      return { ok: false, error: parsed.error, response: body };
    }
    return {
      ok: true,
      providerMessageId: parsed.messageId,
      response: body
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'SMS send failed'
    };
  }
}

function parseSmsAlertResponse(
  body: string
): { ok: true; messageId: string | null } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (!trimmed) return { ok: true, messageId: null };

  try {
    const json = JSON.parse(trimmed) as {
      status?: string;
      description?: string;
      messageid?: string;
      message_id?: string;
    };
    const status = String(json.status ?? '').toLowerCase();
    if (status === 'error' || status === 'failed') {
      const desc = json.description?.trim() || trimmed.slice(0, 200);
      return { ok: false, error: desc };
    }
    const id = json.messageid ?? json.message_id ?? null;
    return { ok: true, messageId: id ? String(id) : null };
  } catch {
    const lower = trimmed.toLowerCase();
    if (lower.includes('error') || lower.includes('invalid')) {
      return { ok: false, error: trimmed.slice(0, 200) };
    }
    return { ok: true, messageId: null };
  }
}

/** POST push.json — mirrors BridgeIT OTP `sendSMS` helper. */
function smsAlertPushRequest(
  hostname: string,
  path: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname,
        path
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString()
          })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}
