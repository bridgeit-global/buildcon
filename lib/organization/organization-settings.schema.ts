import { z } from 'zod';
import {
  isPhoneLengthValidForCountry,
  normalizePhoneDigits,
  optionalEmail,
  phoneLengthErrorMessage
} from '@/lib/form/common-fields';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';

const optionalTrimmed = z.string();

const optionalWebsite = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    try {
      const url = new URL(t.includes('://') ? t : `https://${t}`);
      return Boolean(url.hostname) && url.hostname.includes('.');
    } catch {
      return false;
    }
  },
  { message: 'Enter a valid website URL.' }
);

const optionalPan = z.string().refine(
  (v) => {
    const t = v.trim().toUpperCase();
    if (!t) return true;
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(t);
  },
  { message: 'Enter a valid PAN (e.g. ABCDE1234F).' }
);

const optionalGstin = z.string().refine(
  (v) => {
    const t = v.trim().toUpperCase();
    if (!t) return true;
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(t);
  },
  { message: 'Enter a valid 15-character GSTIN.' }
);

const optionalCin = z.string().refine(
  (v) => {
    const t = v.trim().toUpperCase();
    if (!t) return true;
    // Company CIN (21) or LLPIN (e.g. AAA-1234)
    return (
      /^[UL][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(t) ||
      /^[A-Z]{3}-[0-9]{4}$/.test(t)
    );
  },
  { message: 'Enter a valid CIN or LLPIN.' }
);

const optionalPin = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^\d{6}$/.test(t);
  },
  { message: 'Enter a 6-digit PIN code.' }
);

const optionalIfsc = z.string().refine(
  (v) => {
    const t = v.trim().toUpperCase();
    if (!t) return true;
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(t);
  },
  { message: 'Enter a valid IFSC (e.g. HDFC0001234).' }
);

const optionalBankAccountNo = z.string().refine(
  (v) => {
    const t = v.replace(/\s+/g, '').trim();
    if (!t) return true;
    return /^\d{9,18}$/.test(t);
  },
  { message: 'Enter a valid account number (9–18 digits).' }
);

export const organizationSettingsFormSchema = z
  .object({
    legal_name: z
      .string()
      .trim()
      .min(2, 'Legal name must be at least 2 characters.')
      .max(200, 'Legal name is too long.'),
    trade_name: z
      .string()
      .trim()
      .min(2, 'Trade / brand name must be at least 2 characters.')
      .max(120, 'Trade / brand name is too long.'),
    registered_address: optionalTrimmed.max(500, 'Address is too long.'),
    city: optionalTrimmed.max(100, 'City is too long.'),
    state: optionalTrimmed.max(100, 'State is too long.'),
    pin: optionalPin,
    phone: z.string(),
    phone_country: z.string(),
    email: optionalEmail,
    website: optionalWebsite,
    pan: optionalPan,
    gstin: optionalGstin,
    cin: optionalCin,
    rera_promoter_no: optionalTrimmed.max(64, 'RERA number is too long.'),
    authorized_signatory_name: optionalTrimmed.max(
      120,
      'Signatory name is too long.'
    ),
    bank_name: optionalTrimmed.max(120, 'Bank name is too long.'),
    bank_account_name: optionalTrimmed.max(120, 'Account name is too long.'),
    bank_account_no: optionalBankAccountNo,
    bank_ifsc: optionalIfsc,
    notes: optionalTrimmed.max(2000, 'Notes are too long.')
  })
  .superRefine((data, ctx) => {
    if (
      data.phone.trim() &&
      !isPhoneLengthValidForCountry(data.phone, data.phone_country)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: phoneLengthErrorMessage(data.phone_country)
      });
    }
  });

export type OrganizationSettingsFormValues = z.infer<
  typeof organizationSettingsFormSchema
>;

export type OrganizationSettingsFormField =
  keyof OrganizationSettingsFormValues;

export const EMPTY_ORGANIZATION_SETTINGS_FORM: OrganizationSettingsFormValues =
  {
    legal_name: '',
    trade_name: '',
    registered_address: '',
    city: '',
    state: '',
    pin: '',
    phone: '',
    phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: '',
    website: '',
    pan: '',
    gstin: '',
    cin: '',
    rera_promoter_no: '',
    authorized_signatory_name: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_no: '',
    bank_ifsc: '',
    notes: ''
  };

export function organizationSettingsFormFromRow(row: {
  legal_name: string;
  trade_name: string;
  registered_address: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  phone: string | null;
  phone_country?: string | null;
  email: string | null;
  website: string | null;
  pan: string | null;
  gstin: string | null;
  cin: string | null;
  rera_promoter_no: string | null;
  authorized_signatory_name: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  notes: string | null;
}): OrganizationSettingsFormValues {
  return {
    legal_name: row.legal_name ?? '',
    trade_name: row.trade_name ?? '',
    registered_address: row.registered_address ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    pin: row.pin ?? '',
    phone: row.phone ?? '',
    phone_country: row.phone_country ?? DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: row.email ?? '',
    website: row.website ?? '',
    pan: row.pan ?? '',
    gstin: row.gstin ?? '',
    cin: row.cin ?? '',
    rera_promoter_no: row.rera_promoter_no ?? '',
    authorized_signatory_name: row.authorized_signatory_name ?? '',
    bank_name: row.bank_name ?? '',
    bank_account_name: row.bank_account_name ?? '',
    bank_account_no: row.bank_account_no ?? '',
    bank_ifsc: row.bank_ifsc ?? '',
    notes: row.notes ?? ''
  };
}

export function organizationSettingsPayload(
  values: OrganizationSettingsFormValues
) {
  const trimOrNull = (v: string) => {
    const t = v.trim();
    return t || null;
  };
  const website = trimOrNull(values.website);
  return {
    legal_name: values.legal_name.trim(),
    trade_name: values.trade_name.trim(),
    registered_address: trimOrNull(values.registered_address),
    city: trimOrNull(values.city),
    state: trimOrNull(values.state),
    pin: trimOrNull(values.pin),
    phone: values.phone.trim()
      ? normalizePhoneDigits(values.phone)
      : null,
    phone_country: values.phone_country,
    email: trimOrNull(values.email)?.toLowerCase() ?? null,
    website: website
      ? website.includes('://')
        ? website
        : `https://${website}`
      : null,
    pan: trimOrNull(values.pan)?.toUpperCase() ?? null,
    gstin: trimOrNull(values.gstin)?.toUpperCase() ?? null,
    cin: trimOrNull(values.cin)?.toUpperCase() ?? null,
    rera_promoter_no: trimOrNull(values.rera_promoter_no),
    authorized_signatory_name: trimOrNull(values.authorized_signatory_name),
    bank_name: trimOrNull(values.bank_name),
    bank_account_name: trimOrNull(values.bank_account_name),
    bank_account_no: values.bank_account_no.replace(/\s+/g, '').trim() || null,
    bank_ifsc: trimOrNull(values.bank_ifsc)?.toUpperCase() ?? null,
    notes: trimOrNull(values.notes)
  };
}
