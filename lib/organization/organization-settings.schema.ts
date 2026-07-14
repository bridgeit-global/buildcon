import { z } from 'zod';
import {
  normalizePhoneDigits,
  optionalEmail,
  optionalPhone10
} from '@/lib/form/common-fields';

const optionalTrimmed = z.string();

export const organizationSettingsFormSchema = z.object({
  legal_name: z.string().trim().min(1, 'Legal name is required.'),
  trade_name: z.string().trim().min(1, 'Trade / brand name is required.'),
  registered_address: optionalTrimmed,
  city: optionalTrimmed,
  state: optionalTrimmed,
  pin: z.string().refine(
    (v) => {
      const t = v.trim();
      if (!t) return true;
      return /^\d{6}$/.test(t);
    },
    { message: 'Enter a 6-digit PIN code.' }
  ),
  phone: optionalPhone10,
  email: optionalEmail,
  website: optionalTrimmed,
  pan: z.string().refine(
    (v) => {
      const t = v.trim().toUpperCase();
      if (!t) return true;
      return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(t);
    },
    { message: 'Enter a valid PAN (e.g. ABCDE1234F).' }
  ),
  gstin: z.string().refine(
    (v) => {
      const t = v.trim().toUpperCase();
      if (!t) return true;
      return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(t);
    },
    { message: 'Enter a valid 15-character GSTIN.' }
  ),
  cin: optionalTrimmed,
  rera_promoter_no: optionalTrimmed,
  authorized_signatory_name: optionalTrimmed,
  bank_name: optionalTrimmed,
  bank_account_name: optionalTrimmed,
  bank_account_no: optionalTrimmed,
  bank_ifsc: z.string().refine(
    (v) => {
      const t = v.trim().toUpperCase();
      if (!t) return true;
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(t);
    },
    { message: 'Enter a valid IFSC (e.g. HDFC0001234).' }
  ),
  notes: optionalTrimmed
});

export type OrganizationSettingsFormValues = z.infer<
  typeof organizationSettingsFormSchema
>;

export const EMPTY_ORGANIZATION_SETTINGS_FORM: OrganizationSettingsFormValues = {
  legal_name: '',
  trade_name: '',
  registered_address: '',
  city: '',
  state: '',
  pin: '',
  phone: '',
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
    email: trimOrNull(values.email)?.toLowerCase() ?? null,
    website: trimOrNull(values.website),
    pan: trimOrNull(values.pan)?.toUpperCase() ?? null,
    gstin: trimOrNull(values.gstin)?.toUpperCase() ?? null,
    cin: trimOrNull(values.cin)?.toUpperCase() ?? null,
    rera_promoter_no: trimOrNull(values.rera_promoter_no),
    authorized_signatory_name: trimOrNull(values.authorized_signatory_name),
    bank_name: trimOrNull(values.bank_name),
    bank_account_name: trimOrNull(values.bank_account_name),
    bank_account_no: trimOrNull(values.bank_account_no),
    bank_ifsc: trimOrNull(values.bank_ifsc)?.toUpperCase() ?? null,
    notes: trimOrNull(values.notes)
  };
}
