export {
  extractAadhaarFromText,
  extractPanFromText
} from '@/lib/customer/kyc-ocr-extract';

export type KycOcrDocType = 'pan' | 'aadhaar' | 'photo';

export type KycOcrResult = {
  text: string;
  pan: string | null;
  aadhaar: string | null;
};

export type KycOcrOrientResult = KycOcrResult & {
  blob: Blob;
  /** Degrees clockwise applied to make text readable. 0 = no rotate. */
  rotationDeg: 0 | 90 | 180 | 270;
};

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

type ApiOcrResponse = {
  text?: string;
  pan?: string | null;
  aadhaar?: string | null;
  rotationDeg?: number;
  error?: string;
};

async function recognizeViaApi(
  image: Blob | File,
  docType: 'pan' | 'aadhaar'
): Promise<KycOcrResult & { rotationDeg: 0 | 90 | 180 | 270 }> {
  const form = new FormData();
  const file =
    image instanceof File
      ? image
      : new File([image], 'kyc.jpg', {
          type: image.type || 'image/jpeg'
        });
  form.set('file', file);
  form.set('docType', docType);

  const res = await fetch('/api/crm/kyc/ocr', {
    method: 'POST',
    body: form
  });

  let body: ApiOcrResponse = {};
  try {
    body = (await res.json()) as ApiOcrResponse;
  } catch {
    body = {};
  }

  if (!res.ok) {
    throw new Error(body.error || `OCR failed (${res.status})`);
  }

  const deg = body.rotationDeg;
  const rotationDeg: 0 | 90 | 180 | 270 =
    deg === 90 || deg === 180 || deg === 270 ? deg : 0;

  return {
    text: String(body.text ?? ''),
    pan: typeof body.pan === 'string' ? body.pan : null,
    aadhaar: typeof body.aadhaar === 'string' ? body.aadhaar : null,
    rotationDeg
  };
}

/**
 * Run AI vision OCR on an image blob/file and extract KYC identifiers.
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

  if (typeof image === 'string') {
    throw new Error('OCR expects an image Blob or File.');
  }

  const { rotationDeg: _r, ...result } = await withTimeout(
    recognizeViaApi(image, docType),
    45_000,
    'OCR'
  );
  return result;
}

/**
 * AI OCR the image once. If the model reports the card is rotated, rotate
 * the blob clockwise so the uploaded crop is upright.
 */
export async function runKycOcrWithAutoOrient(
  image: Blob,
  docType: KycOcrDocType
): Promise<KycOcrOrientResult> {
  if (docType === 'photo') {
    return { text: '', pan: null, aadhaar: null, blob: image, rotationDeg: 0 };
  }

  if (typeof window === 'undefined') {
    throw new Error('OCR is only available in the browser.');
  }

  return withTimeout(
    (async () => {
      const first = await recognizeViaApi(image, docType);
      if (first.rotationDeg === 0) {
        return { ...first, blob: image, rotationDeg: 0 as const };
      }

      try {
        const rotated = await rotateBlobCw(image, first.rotationDeg);
        return { ...first, blob: rotated, rotationDeg: first.rotationDeg };
      } catch (e) {
        console.warn('OCR rotate failed', e);
        return { ...first, blob: image, rotationDeg: 0 as const };
      }
    })(),
    50_000,
    'OCR auto-orient'
  );
}
