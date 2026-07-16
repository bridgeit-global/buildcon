import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import {
  runKycOcrWithAi,
  type KycOcrAiDocType,
  type KycOcrAiProvider
} from '@/lib/customer/kyc-ocr-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

function parseDocType(raw: FormDataEntryValue | null): KycOcrAiDocType | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'pan' || v === 'aadhaar') return v;
  return null;
}

function parseProvider(
  raw: FormDataEntryValue | null
): KycOcrAiProvider | undefined {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'gemini' || v === 'openai' || v === 'anthropic') return v;
  return undefined;
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const docType = parseDocType(form.get('docType'));
  if (!docType) {
    return NextResponse.json(
      { error: 'docType must be pan or aadhaar' },
      { status: 400 }
    );
  }

  const file = form.get('file') ?? form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Image must be between 1 byte and 6MB' },
      { status: 400 }
    );
  }

  const mimeType = (file.type || 'image/jpeg').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: 'Unsupported image type. Use JPEG, PNG, or WebP.' },
      { status: 400 }
    );
  }

  const provider = parseProvider(form.get('provider'));

  try {
    const imageBytes = Buffer.from(await file.arrayBuffer());
    const result = await runKycOcrWithAi({
      imageBytes,
      mimeType,
      docType,
      provider
    });

    return NextResponse.json({
      text: result.text,
      pan: result.pan,
      aadhaar: result.aadhaar,
      rotationDeg: result.rotationDeg,
      provider: result.provider,
      model: result.model
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OCR failed';
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
