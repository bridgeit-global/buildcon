import { z } from 'zod';
import { normalizePhoneDigits } from '@/lib/form/common-fields';

const optionalEmail = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  },
  { message: 'Enter a valid email address.' }
);

const optionalPhone = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return normalizePhoneDigits(v).length === 10;
  },
  { message: 'Enter a 10-digit phone number.' }
);

export const brokerFormSchema = z.object({
  full_name: z.string().trim().min(1, 'Broker name is required.'),
  phone: optionalPhone,
  email: optionalEmail,
  license_no: z.string(),
  status: z.enum(['Active', 'Inactive']),
  notes: z.string()
});

export type BrokerFormValues = z.infer<typeof brokerFormSchema>;

export const EMPTY_BROKER_FORM: BrokerFormValues = {
  full_name: '',
  phone: '',
  email: '',
  license_no: '',
  status: 'Active',
  notes: ''
};

export function brokerFormPayload(values: BrokerFormValues) {
  return {
    full_name: values.full_name.trim(),
    phone: values.phone.trim()
      ? normalizePhoneDigits(values.phone)
      : null,
    email: values.email.trim() || null,
    license_no: values.license_no.trim() || null,
    status: values.status,
    notes: values.notes.trim() || null
  };
}
