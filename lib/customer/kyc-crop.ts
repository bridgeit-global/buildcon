export type CroppedAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () =>
      reject(new Error('Failed to load image for cropping.'))
    );
    // blob:/data: URLs must not set crossOrigin — it can block canvas draw.
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

/**
 * Crop `imageSrc` to `croppedAreaPixels` and return a JPEG blob.
 * Optionally upscale for better OCR (`scale` > 1).
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  croppedAreaPixels: CroppedAreaPixels,
  quality = 0.92,
  scale = 1
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const w = Math.max(1, Math.round(croppedAreaPixels.width * scale));
  const h = Math.max(1, Math.round(croppedAreaPixels.height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    w,
    h
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create cropped image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

export function croppedBlobToFile(
  blob: Blob,
  baseName = 'kyc-crop'
): File {
  const name = `${baseName.replace(/\.[^.]+$/, '')}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

/** Rotate an image blob clockwise by 90, 180, or 270 degrees. */
export async function rotateImageBlobCw(
  blob: Blob,
  degrees: 90 | 180 | 270
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
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
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to rotate image.'))),
        'image/jpeg',
        0.92
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Card-like aspect for PAN / Aadhaar; square for photo. */
export function kycCropAspectRatio(docType: string): number {
  if (docType === 'photo') return 1;
  return 1.586;
}
