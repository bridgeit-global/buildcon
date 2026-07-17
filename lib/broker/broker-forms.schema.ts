import { z } from 'zod';
import {
  isPhoneLengthValidForCountry,
  normalizePhoneDigits,
  phoneLengthErrorMessage
} from '@/lib/form/common-fields';
import { formatFullName, splitFullName } from '@/lib/person-name';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';

const optionalEmail = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  },
  { message: 'Enter a valid email address.' }
);

export const brokerFormSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required.'),
    middle_name: z.string(),
    last_name: z.string().trim().min(1, 'Last name is required.'),
    phone: z.string(),
    phone_country: z.string(),
    email: optionalEmail,
    license_no: z.string(),
    status: z.enum(['Active', 'Inactive']),
    notes: z.string()
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

export type BrokerFormValues = z.infer<typeof brokerFormSchema>;

export const EMPTY_BROKER_FORM: BrokerFormValues = {
  first_name: '',
  middle_name: '',
  last_name: '',
  phone: '',
  phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
  email: '',
  license_no: '',
  status: 'Active',
  notes: ''
};

export function brokerFormValuesFromRow(row: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone: string | null;
  email: string | null;
  license_no: string | null;
  status: string;
  notes: string | null;
}): BrokerFormValues {
  const first = String(row.first_name ?? '').trim();
  const last = String(row.last_name ?? '').trim();
  const middle = String(row.middle_name ?? '').trim();
  const fromFull = !first && !last ? splitFullName(row.full_name) : null;
  return {
    first_name: first || fromFull?.first_name || '',
    middle_name: middle || fromFull?.middle_name || '',
    last_name: last || fromFull?.last_name || '',
    phone: row.phone ?? '',
    phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: row.email ?? '',
    license_no: row.license_no ?? '',
    status: row.status === 'Inactive' ? 'Inactive' : 'Active',
    notes: row.notes ?? ''
  };
}

export function brokerFormPayload(values: BrokerFormValues) {
  const first_name = values.first_name.trim();
  const middle_name = values.middle_name.trim();
  const last_name = values.last_name.trim();
  return {
    first_name,
    middle_name: middle_name || null,
    last_name,
    full_name: formatFullName({ first_name, middle_name, last_name }),
    phone: values.phone.trim()
      ? normalizePhoneDigits(values.phone)
      : null,
    email: values.email.trim() || null,
    license_no: values.license_no.trim() || null,
    status: values.status,
    notes: values.notes.trim() || null
  };
}
