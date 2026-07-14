import {
  croppedBlobToFile,
  kycCropAspectRatio
} from '@/lib/customer/kyc-crop';

export type Point = { x: number; y: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () =>
      reject(new Error('Failed to load image for document scan.'))
    );
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode cropped document.'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Find non-background content bounds (cards on plain tables / walls).
 * Samples corner colors as background so light cream cards still isolate.
 */
function findContentBounds(
  imageData: ImageData,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  const data = imageData.data;

  function pixelAt(x: number, y: number) {
    const i = (y * width + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
  }

  const samples = [
    pixelAt(2, 2),
    pixelAt(width - 3, 2),
    pixelAt(2, height - 3),
    pixelAt(width - 3, height - 3),
    pixelAt(Math.floor(width / 2), 2),
    pixelAt(Math.floor(width / 2), height - 3)
  ];
  const bg = [0, 0, 0] as [number, number, number];
  for (const s of samples) {
    bg[0] += s[0];
    bg[1] += s[1];
    bg[2] += s[2];
  }
  bg[0] = Math.round(bg[0] / samples.length);
  bg[1] = Math.round(bg[1] / samples.length);
  bg[2] = Math.round(bg[2] / samples.length);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 900));
  const distThresh = 28;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [r, g, b] = pixelAt(x, y);
      const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (dist >= distThresh) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const pad = Math.round(Math.min(width, height) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w < 40 || h < 40) return null;

  const areaRatio = (w * h) / (width * height);
  if (areaRatio > 0.97) return null;

  return { x: minX, y: minY, width: w, height: h };
}

function cropCanvas(
  source: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.width));
  out.height = Math.max(1, Math.round(box.height));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(
    source,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    out.width,
    out.height
  );
  return out;
}

type CvRuntime = {
  Mat: new (...args: unknown[]) => { delete: () => void };
  imread: (el: HTMLCanvasElement | HTMLImageElement) => {
    delete: () => void;
  };
  onRuntimeInitialized?: () => void;
};

type JscanifyCtor = new () => {
  extractPaper: (
    image: HTMLImageElement | HTMLCanvasElement,
    w: number,
    h: number
  ) => HTMLCanvasElement | null;
};

declare global {
  interface Window {
    cv?: CvRuntime;
    jscanify?: JscanifyCtor;
  }
}

let openCvLoadPromise: Promise<CvRuntime> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-kyc-doc-script="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.kycDocScript = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureOpenCv(): Promise<CvRuntime> {
  if (typeof window === 'undefined') {
    throw new Error('Document scan is browser-only.');
  }
  if (window.cv?.Mat) return window.cv;

  if (!openCvLoadPromise) {
    openCvLoadPromise = (async () => {
      await loadScript('/jscanify/opencv.js');
      const cv = window.cv;
      if (!cv) throw new Error('OpenCV failed to initialize.');
      if (cv.Mat) return cv;
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
      return cv;
    })().catch((err) => {
      openCvLoadPromise = null;
      throw err;
    });
  }
  return openCvLoadPromise;
}

async function ensureJscanify(): Promise<JscanifyCtor> {
  if (window.jscanify) return window.jscanify;
  await loadScript('/jscanify/jscanify.js');
  if (!window.jscanify) throw new Error('jscanify failed to load.');
  return window.jscanify;
}

/**
 * Corner-based perspective extract via OpenCV + jscanify (local /public assets).
 */
async function extractWithJscanify(
  image: HTMLImageElement,
  docType: string
): Promise<HTMLCanvasElement | null> {
  try {
    await ensureOpenCv();
    const Jscanify = await ensureJscanify();
    const scanner = new Jscanify();
    const aspect = kycCropAspectRatio(docType);
    const resultWidth = 1000;
    const resultHeight = Math.round(resultWidth / aspect);
    const extracted = scanner.extractPaper(image, resultWidth, resultHeight);
    if (!extracted || extracted.width < 40 || extracted.height < 40) {
      return null;
    }
    // Keep extracted orientation as-is; OCR layer rotates only if text is not upright.
    return extracted;
  } catch (e) {
    console.warn('Corner extract failed, using content bounds', e);
    return null;
  }
}

/**
 * Fallback: content bounding-box crop + rotate to landscape for ID cards.
 * Handles sideways phone photos of PAN/Aadhaar on plain backgrounds.
 */
function extractWithContentBounds(
  image: HTMLImageElement,
  docType: string
): HTMLCanvasElement {
  const maxSide = 1800;
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));

  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(image, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const box = findContentBounds(imageData, w, h);

  let cropped = box ? cropCanvas(work, box) : work;

  // Do not force-rotate here — orientation is fixed only when OCR cannot read upright text.

  if (cropped.width < 900) {
    const up = document.createElement('canvas');
    const factor = 900 / cropped.width;
    up.width = Math.round(cropped.width * factor);
    up.height = Math.round(cropped.height * factor);
    const upCtx = up.getContext('2d');
    if (upCtx) {
      upCtx.imageSmoothingEnabled = true;
      upCtx.imageSmoothingQuality = 'high';
      upCtx.drawImage(cropped, 0, 0, up.width, up.height);
      cropped = up;
    }
  }

  return cropped;
}

export type NormalizeDocumentResult = {
  blob: Blob;
  file: File;
  method: 'corners' | 'bounds';
  width: number;
  height: number;
};

/**
 * Auto-crop ID card via content bounds.
 * Rotation is deferred to OCR — only when text is not readable upright.
 */
export async function normalizeKycDocumentImage(
  imageSrc: string,
  docType: string,
  fileBaseName = 'kyc-doc'
): Promise<NormalizeDocumentResult> {
  const image = await loadImage(imageSrc);
  const canvas = extractWithContentBounds(image, docType);
  const blob = await canvasToJpegBlob(canvas, 0.92);
  return {
    blob,
    file: croppedBlobToFile(blob, fileBaseName),
    method: 'bounds',
    width: canvas.width,
    height: canvas.height
  };
}

/**
 * Optional OpenCV corner refine. Times out quickly so it never freezes the UI.
 * Call only when you can afford a background upgrade — not on the critical path.
 */
export async function tryRefineWithCorners(
  imageSrc: string,
  docType: string,
  timeoutMs = 4000
): Promise<NormalizeDocumentResult | null> {
  try {
    const image = await loadImage(imageSrc);
    const cornerCanvas = await Promise.race([
      extractWithJscanify(image, docType),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
    if (!cornerCanvas) return null;
    const blob = await canvasToJpegBlob(cornerCanvas, 0.92);
    return {
      blob,
      file: croppedBlobToFile(blob, 'kyc-doc-corners'),
      method: 'corners',
      width: cornerCanvas.width,
      height: cornerCanvas.height
    };
  } catch {
    return null;
  }
}
