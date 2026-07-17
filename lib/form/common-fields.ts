import { z } from 'zod';
import {
  DEFAULT_COUNTRY_DIAL_CODE_OPTION,
  phoneLengthForOption
} from '@/lib/phone/country-dial-codes';

export function normalizePhoneDigits(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

/** Expected mobile number digit count for the selected country picker option (defaults to India/10). */
export function expectedPhoneLength(country: string | null | undefined): number {
  return phoneLengthForOption(country || DEFAULT_COUNTRY_DIAL_CODE_OPTION);
}

/** True when `phone` has exactly as many digits as its `country` option expects. */
export function isPhoneLengthValidForCountry(
  phone: string | null | undefined,
  country: string | null | undefined
): boolean {
  return normalizePhoneDigits(phone).length === expectedPhoneLength(country);
}

export function phoneLengthErrorMessage(country: string | null | undefined): string {
  return `Enter a ${expectedPhoneLength(country)}-digit phone number.`;
}

export const optionalEmail = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  },
  { message: 'Enter a valid email address.' }
);

export const requiredEmail = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'Enter a valid email address.'
  });

export const phone10 = z.string().refine(
  (v) => normalizePhoneDigits(v).length === 10,
  { message: 'Enter a 10-digit phone number.' }
);

export const optionalPhone10 = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return normalizePhoneDigits(v).length === 10;
  },
  { message: 'Enter a 10-digit phone number.' }
);

export const customerNameMin2 = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters for the name.');

export const positiveNumberString = (label = 'amount') =>
  z.string().refine(
    (v) => {
      const n = Number(String(v).replace(/,/g, '').trim());
      return Number.isFinite(n) && n > 0;
    },
    { message: `Enter a positive ${label}.` }
  );

export const nonNegativeNumberString = z.string().refine(
  (v) => {
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) && n >= 0;
  },
  { message: 'Enter a valid number (0 or more).' }
);

export const optionalUuid = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      t
    );
  },
  { message: 'Enter a valid UUID.' }
);

export const requiredUuid = z
  .string()
  .trim()
  .min(1, 'This field is required.')
  .refine(
    (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v
      ),
    { message: 'Enter a valid UUID.' }
  );
