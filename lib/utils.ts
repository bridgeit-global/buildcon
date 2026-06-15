import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const protocol =
  process.env.NODE_ENV === 'production' ? 'https' : 'http';
export const rootDomain =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display-friendly short ID: first 8 characters, uppercased. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Remove UUIDs from text before showing errors or labels in the UI. */
export function withoutDbIds(text: string): string {
  return text.replace(UUID_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

/** Safe user-facing error: strips DB ids and falls back when nothing remains. */
export function userFacingError(
  message: string | null | undefined,
  fallback: string
): string {
  if (!message?.trim()) return fallback;
  const cleaned = withoutDbIds(message);
  return cleaned || fallback;
}
