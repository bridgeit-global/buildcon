import {
  isAadhaarValid,
  isPanValid,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

/** PAN pattern with optional spaces/hyphens between groups. */
const PAN_LOOSE_RE = /\b([A-Za-z]{5})\s*[-]?\s*([0-9]{4})\s*[-]?\s*([A-Za-z])\b/g;

/** 12-digit runs, optionally grouped as 4-4-4. */
const AADHAAR_GROUPED_RE = /\b(\d{4})\s*[-]?\s*(\d{4})\s*[-]?\s*(\d{4})\b/g;
const AADHAAR_PLAIN_RE = /\b(\d{12})\b/g;

function looksMasked(segment: string): boolean {
  return /x/i.test(segment);
}

/**
 * Extract the first valid PAN from OCR text.
 * Skips masked placeholders (e.g. XXXXX1234X).
 */
export function extractPanFromText(text: string): string | null {
  const raw = String(text ?? '');
  PAN_LOOSE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAN_LOOSE_RE.exec(raw)) !== null) {
    if (looksMasked(m[0])) continue;
    const pan = normalizePan(`${m[1]}${m[2]}${m[3]}`);
    if (isPanValid(pan)) return pan;
  }
  // Fallback: strip noise and scan sliding 10-char windows of alphanumerics
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i <= compact.length - 10; i++) {
    const slice = compact.slice(i, i + 10);
    if (looksMasked(slice)) continue;
    if (isPanValid(slice)) return normalizePan(slice);
  }
  return null;
}

function firstAadhaarInSegment(segment: string): string | null {
  AADHAAR_GROUPED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AADHAAR_GROUPED_RE.exec(segment)) !== null) {
    if (looksMasked(m[0])) continue;
    const digits = normalizeAadhaar(`${m[1]}${m[2]}${m[3]}`);
    if (isAadhaarValid(digits)) return digits;
  }

  AADHAAR_PLAIN_RE.lastIndex = 0;
  while ((m = AADHAAR_PLAIN_RE.exec(segment)) !== null) {
    if (looksMasked(m[0])) continue;
    const digits = normalizeAadhaar(m[1]!);
    if (isAadhaarValid(digits)) return digits;
  }
  return null;
}

/**
 * Extract the first valid 12-digit Aadhaar from OCR text.
 * Skips masked groups (e.g. XXXX XXXX 1234) by blanking X-runs before match,
 * and scans line-by-line so a trailing last-4 does not glue onto the next line.
 */
export function extractAadhaarFromText(text: string): string | null {
  const raw = String(text ?? '');
  const scrubbed = raw.replace(/x{2,}/gi, ' ');
  for (const line of scrubbed.split(/\r?\n/)) {
    const found = firstAadhaarInSegment(line);
    if (found) return found;
  }
  if (!scrubbed.includes('\n') && !scrubbed.includes('\r')) {
    return firstAadhaarInSegment(scrubbed);
  }
  // Last resort: full scrubbed text (handles soft line breaks as spaces).
  return firstAadhaarInSegment(scrubbed.replace(/\s+/g, ' '));
}

export type KycOcrDocType = 'pan' | 'aadhaar' | 'photo';

export type KycOcrResult = {
  text: string;
  pan: string | null;
  aadhaar: string | null;
};

/** Prefer same-origin assets under /public/tesseract. */
const TESSERACT_PATHS = {
  workerPath: '/tesseract/worker.min.js',
  // Exact file path — avoids missing relaxedsimd variants on some CPUs.
  corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0'
} as const;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run Tesseract OCR on an image blob/file and extract KYC identifiers.
 * Call only in the browser. Hard-times out so the UI cannot hang forever.
 */
export async function runKycOcr(
  image: Blob | File | string,
  docType: KycOcrDocType
): Promise<KycOcrResult> {
  if (docType === 'photo') {
    return { text: '', pan: null, aadhaar: null };
  }

  if (typeof window === 'undefined') {
    throw new Error('OCR is only available in the browser.');
  }

  return withTimeout(recognizeOnce(image, docType), 25_000, 'OCR');
}

export type KycOcrOrientResult = KycOcrResult & {
  blob: Blob;
  /** Degrees clockwise applied to make text readable. 0 = no rotate. */
  rotationDeg: 0 | 90 | 180 | 270;
};

function loadBlobAsImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for orientation.'));
    };
    img.src = url;
  });
}

function rotateBlobCw(blob: Blob, degrees: 90 | 180 | 270): Promise<Blob> {
  return loadBlobAsImage(blob).then(
    (img) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const rad = (degrees * Math.PI) / 180;
        if (degrees === 180) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        } else {
          canvas.width = img.naturalHeight;
          canvas.height = img.naturalWidth;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
          'image/jpeg',
          0.92
        );
      })
  );
}

function ocrFoundId(ocr: KycOcrResult, docType: KycOcrDocType): boolean {
  if (docType === 'pan') return Boolean(ocr.pan);
  if (docType === 'aadhaar') return Boolean(ocr.aadhaar);
  return false;
}

async function recognizeOnce(
  image: Blob | File | string,
  docType: KycOcrDocType
): Promise<KycOcrResult> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: TESSERACT_PATHS.workerPath,
    corePath: TESSERACT_PATHS.corePath,
    langPath: TESSERACT_PATHS.langPath,
    workerBlobURL: false,
    logger: () => undefined
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      ...(docType === 'pan'
        ? {
            tessedit_char_whitelist:
              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- '
          }
        : {
            tessedit_char_whitelist: '0123456789- '
          })
    });

    const {
      data: { text }
    } = await worker.recognize(image);

    return {
      text,
      pan: docType === 'pan' ? extractPanFromText(text) : null,
      aadhaar: docType === 'aadhaar' ? extractAadhaarFromText(text) : null
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR the image as-is first. Rotate (90/180/270) only when the ID number
 * cannot be read — i.e. text is sideways or upside-down.
 */
export async function runKycOcrWithAutoOrient(
  image: Blob,
  docType: KycOcrDocType
): Promise<KycOcrOrientResult> {
  if (docType === 'photo') {
    return { text: '', pan: null, aadhaar: null, blob: image, rotationDeg: 0 };
  }

  return withTimeout(
    (async () => {
      const first = await recognizeOnce(image, docType);
      if (ocrFoundId(first, docType)) {
        return { ...first, blob: image, rotationDeg: 0 as const };
      }

      const turns: Array<90 | 180 | 270> = [90, 270, 180];
      for (const deg of turns) {
        try {
          const rotated = await rotateBlobCw(image, deg);
          const ocr = await recognizeOnce(rotated, docType);
          if (ocrFoundId(ocr, docType)) {
            return { ...ocr, blob: rotated, rotationDeg: deg };
          }
        } catch (e) {
          console.warn(`OCR orient ${deg}° failed`, e);
        }
      }

      // Keep original crop if no orientation yielded a readable ID.
      return { ...first, blob: image, rotationDeg: 0 as const };
    })(),
    60_000,
    'OCR auto-orient'
  );
}
