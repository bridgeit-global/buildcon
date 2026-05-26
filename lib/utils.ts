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
