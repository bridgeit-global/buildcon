import type { SupabaseClient } from '@supabase/supabase-js';

export const ORG_BRAND_LOGO_BUCKET = 'documents';
export const ORG_BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

export function brandLogoStoragePath(ext: string): string {
  return `organization/brand-logo.${ext}`;
}

export function validateBrandLogoFile(file: {
  type: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; error: string } {
  const mime = String(file.type || '')
    .trim()
    .toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    return {
      ok: false,
      error: 'Upload a PNG, JPG, WebP, or SVG logo (max 2 MB).'
    };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'Logo file is empty.' };
  }
  if (file.size > ORG_BRAND_LOGO_MAX_BYTES) {
    return { ok: false, error: 'Logo must be 2 MB or smaller.' };
  }
  return { ok: true, ext };
}

async function blobToDataUri(blob: Blob, fallbackMime: string): Promise<string> {
  const mime = blob.type || fallbackMime;
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(await blob.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read logo'));
    reader.readAsDataURL(blob);
  });
}

/** Downloads logo from storage as a data URI for print / PDF embedding. */
export async function loadBrandLogoDataUri(
  supabase: SupabaseClient,
  storagePath: string | null | undefined
): Promise<string | null> {
  const path = String(storagePath ?? '').trim();
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(ORG_BRAND_LOGO_BUCKET)
      .download(path);
    if (error || !data) return null;
    return await blobToDataUri(data, guessMimeFromPath(path));
  } catch {
    return null;
  }
}

export async function createBrandLogoSignedUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string | null> {
  const path = String(storagePath ?? '').trim();
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(ORG_BRAND_LOGO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}
