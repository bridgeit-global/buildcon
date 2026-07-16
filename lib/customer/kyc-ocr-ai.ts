import {
  extractAadhaarFromText,
  extractPanFromText
} from '@/lib/customer/kyc-ocr-extract';
import {
  isAadhaarValid,
  isPanValid,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

export type KycOcrAiProvider = 'gemini' | 'openai' | 'anthropic';

export type KycOcrAiDocType = 'pan' | 'aadhaar';

export type KycOcrAiResult = {
  text: string;
  pan: string | null;
  aadhaar: string | null;
  /** Clockwise degrees to make the card upright (0 if already upright / unknown). */
  rotationDeg: 0 | 90 | 180 | 270;
  provider: KycOcrAiProvider;
  model: string;
};

const DEFAULT_MODELS: Record<KycOcrAiProvider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514'
};

function parseProvider(raw: string | undefined): KycOcrAiProvider {
  const v = (raw ?? 'gemini').trim().toLowerCase();
  if (v === 'openai' || v === 'anthropic' || v === 'gemini') return v;
  return 'gemini';
}

export function resolveKycOcrProvider(): KycOcrAiProvider {
  return parseProvider(process.env.KYC_OCR_PROVIDER);
}

export function resolveKycOcrModel(provider: KycOcrAiProvider): string {
  const override = process.env.KYC_OCR_MODEL?.trim();
  if (override) return override;
  return DEFAULT_MODELS[provider];
}

function apiKeyFor(provider: KycOcrAiProvider): string | null {
  if (provider === 'gemini') {
    return (
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      null
    );
  }
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

function buildPrompt(docType: KycOcrAiDocType): string {
  const target =
    docType === 'pan'
      ? 'Extract the Indian PAN (Permanent Account Number) in format AAAAA9999A.'
      : 'Extract the 12-digit Aadhaar number (UID). Ignore masked digits (X).';

  return [
    'You are reading an Indian KYC identity document image.',
    target,
    'Also return any readable OCR text you see.',
    'If the card appears sideways or upside-down, set rotation_deg to the clockwise degrees (90, 180, or 270) needed to make text upright; otherwise 0.',
    'Return JSON only with keys: pan (string|null), aadhaar (string|null), text (string), rotation_deg (0|90|180|270).',
    'Use null for identifiers that are missing or not requested.',
    'Do not invent numbers. Skip masked placeholders like XXXXX1234X or XXXX XXXX 1234.'
  ].join(' ');
}

function normalizeRotation(raw: unknown): 0 | 90 | 180 | 270 {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

function parseModelJson(raw: string): {
  pan: string | null;
  aadhaar: string | null;
  text: string;
  rotationDeg: 0 | 90 | 180 | 270;
} {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    // Model returned prose — fall back to regex extractors on full text.
    return {
      pan: extractPanFromText(trimmed),
      aadhaar: extractAadhaarFromText(trimmed),
      text: trimmed,
      rotationDeg: 0
    };
  }

  const text = String(parsed.text ?? '').trim() || jsonText;
  const panRaw =
    typeof parsed.pan === 'string' ? normalizePan(parsed.pan) : '';
  const aadhaarRaw =
    typeof parsed.aadhaar === 'string' ? normalizeAadhaar(parsed.aadhaar) : '';

  const pan =
    (panRaw && isPanValid(panRaw) ? panRaw : null) ??
    extractPanFromText(text) ??
    extractPanFromText(jsonText);

  const aadhaar =
    (aadhaarRaw && isAadhaarValid(aadhaarRaw) ? aadhaarRaw : null) ??
    extractAadhaarFromText(text) ??
    extractAadhaarFromText(jsonText);

  return {
    pan,
    aadhaar,
    text,
    rotationDeg: normalizeRotation(parsed.rotation_deg ?? parsed.rotationDeg)
  };
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64: string;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: params.prompt },
            {
              inlineData: {
                mimeType: params.mimeType,
                data: params.base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    })
  });

  const body = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    throw new Error(body.error?.message || `Gemini OCR failed (${res.status})`);
  }

  const text = body.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned empty OCR content.');
  return text;
}

async function callOpenAi(params: {
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64: string;
}): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: params.prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${params.mimeType};base64,${params.base64}`
              }
            }
          ]
        }
      ]
    })
  });

  const body = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  if (!res.ok) {
    throw new Error(body.error?.message || `OpenAI OCR failed (${res.status})`);
  }

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty OCR content.');
  return text;
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  base64: string;
}): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: params.mimeType,
                data: params.base64
              }
            },
            { type: 'text', text: params.prompt }
          ]
        }
      ]
    })
  });

  const body = (await res.json()) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!res.ok) {
    throw new Error(
      body.error?.message || `Anthropic OCR failed (${res.status})`
    );
  }

  const text = body.content
    ?.filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Anthropic returned empty OCR content.');
  return text;
}

export async function runKycOcrWithAi(params: {
  imageBytes: Uint8Array | Buffer;
  mimeType: string;
  docType: KycOcrAiDocType;
  provider?: KycOcrAiProvider;
}): Promise<KycOcrAiResult> {
  const provider = params.provider ?? resolveKycOcrProvider();
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    const hint =
      provider === 'gemini'
        ? 'Set GEMINI_API_KEY (or GOOGLE_API_KEY).'
        : provider === 'openai'
          ? 'Set OPENAI_API_KEY.'
          : 'Set ANTHROPIC_API_KEY.';
    throw new Error(`KYC OCR provider "${provider}" is not configured. ${hint}`);
  }

  const model = resolveKycOcrModel(provider);
  const prompt = buildPrompt(params.docType);
  const base64 = Buffer.from(params.imageBytes).toString('base64');
  const mimeType = params.mimeType.startsWith('image/')
    ? params.mimeType
    : 'image/jpeg';

  let raw: string;
  if (provider === 'gemini') {
    raw = await callGemini({ apiKey, model, prompt, mimeType, base64 });
  } else if (provider === 'openai') {
    raw = await callOpenAi({ apiKey, model, prompt, mimeType, base64 });
  } else {
    raw = await callAnthropic({ apiKey, model, prompt, mimeType, base64 });
  }

  const parsed = parseModelJson(raw);
  return {
    text: parsed.text,
    pan: params.docType === 'pan' ? parsed.pan : null,
    aadhaar: params.docType === 'aadhaar' ? parsed.aadhaar : null,
    rotationDeg: parsed.rotationDeg,
    provider,
    model
  };
}

/** Exported for unit tests. */
export const __test = {
  parseModelJson,
  parseProvider,
  normalizeRotation,
  buildPrompt
};
