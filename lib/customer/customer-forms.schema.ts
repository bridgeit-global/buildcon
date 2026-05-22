import { z } from 'zod';
import {
  isAadhaarLast4Valid,
  isPanValid,
  normalizeAadhaarLast4,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

export function normalizePhoneDigits(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

const phone10 = z
  .string()
  .refine((v) => normalizePhoneDigits(v).length === 10, {
    message: 'Enter a 10-digit phone number.'
  });

const optionalEmail = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  },
  { message: 'Enter a valid email address.' }
);

const optionalPan = z.string().refine(
  (v) => {
    const panNorm = normalizePan(v);
    return !panNorm || isPanValid(panNorm);
  },
  { message: 'Enter a valid PAN (e.g. ABCDE1234F).' }
);

const optionalAadhaarLast4 = z.string().refine(
  (v) => {
    const a4Raw = String(v ?? '').trim();
    return !a4Raw || isAadhaarLast4Valid(a4Raw);
  },
  { message: 'Enter the last 4 digits of Aadhaar.' }
);

const pinOptional = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return /^\d{6}$/.test(t);
  },
  { message: 'Enter a 6-digit PIN code.' }
);

const ifscOptional = z.string().refine(
  (v) => {
    const t = v.trim().toUpperCase();
    if (!t) return true;
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(t);
  },
  { message: 'Enter a valid IFSC (e.g. HDFC0001234).' }
);

const addressKind = z.enum(['current', 'permanent']);

/** Add-customer dialog */
export const customerCreateSchema = z.object({
  full_name: z.string().trim().min(1, 'Customer name is required.'),
  phone: phone10,
  email: optionalEmail,
  dob: z.string(),
  occupation: z.string(),
  nationality: z.string(),
  guardian_name: z.string(),
  residential_status: z.string(),
  passport_number: z.string(),
  office_name_address: z.string()
});

/** Edit-customer dialog (includes KYC identifiers on profile) */
export const customerEditSchema = customerCreateSchema.extend({
  pan_number: optionalPan,
  aadhaar_last4: optionalAadhaarLast4
});

/** KYC tab — PAN & Aadhaar only */
export const kycIdentitySchema = z.object({
  pan_number: optionalPan,
  aadhaar_last4: optionalAadhaarLast4
});

/** Address dialog */
export const addressFormSchema = z.object({
  kind: addressKind,
  address_line1: z.string().trim().min(1, 'Address line is required.'),
  city: z.string(),
  state: z.string(),
  pin: pinOptional
});

/** Nominee dialog */
export const nomineeFormSchema = z.object({
  nominee_name: z.string().trim().min(1, 'Nominee name is required.'),
  relationship: z.string(),
  nominee_dob: z.string()
});

/** Bank dialog */
export const bankFormSchema = z.object({
  bank_name: z.string().trim().min(1, 'Bank name is required.'),
  account_no: z.string(),
  ifsc: ifscOptional,
  branch: z.string()
});

/** KYC document upload — validated with doc type context */
export const kycUploadSchema = z
  .object({
    docType: z.string(),
    pan_number: z.string(),
    aadhaar_last4: z.string(),
    hasFile: z.boolean()
  })
  .superRefine((data, ctx) => {
    if (data.docType === 'pan') {
      const panNorm = normalizePan(data.pan_number);
      if (!panNorm) {
        ctx.addIssue({
          code: 'custom',
          path: ['pan_number'],
          message: 'PAN number is required for this upload.'
        });
      } else if (!isPanValid(panNorm)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pan_number'],
          message: 'Enter a valid PAN (e.g. ABCDE1234F).'
        });
      }
    }
    if (data.docType === 'aadhaar' && !isAadhaarLast4Valid(data.aadhaar_last4)) {
      ctx.addIssue({
        code: 'custom',
        path: ['aadhaar_last4'],
        message: 'Enter the last 4 digits of Aadhaar.'
      });
    }
    if (!data.hasFile) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasFile'],
        message: 'Choose a file to upload.'
      });
    }
  });

export type CustomerCreateFormValues = z.infer<typeof customerCreateSchema>;
export type CustomerEditFormValues = z.infer<typeof customerEditSchema>;
export type KycIdentityFormValues = z.infer<typeof kycIdentitySchema>;
export type AddressFormValues = z.infer<typeof addressFormSchema>;
export type NomineeFormValues = z.infer<typeof nomineeFormSchema>;
export type BankFormValues = z.infer<typeof bankFormSchema>;
export type KycUploadFormValues = z.infer<typeof kycUploadSchema>;

export const EMPTY_CUSTOMER_CREATE: CustomerCreateFormValues = {
  full_name: '',
  phone: '',
  email: '',
  dob: '',
  occupation: '',
  nationality: 'Indian',
  guardian_name: '',
  residential_status: 'Resident Indian',
  passport_number: '',
  office_name_address: ''
};

export function customerEditValuesFromCustomer(row: {
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  occupation: string | null;
  nationality: string | null;
  pan_number: string | null;
  aadhaar_last4: string | null;
  guardian_name: string | null;
  residential_status: string | null;
  passport_number: string | null;
  office_name_address: string | null;
}): CustomerEditFormValues {
  return {
    full_name: row.full_name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    dob: row.dob ? String(row.dob).slice(0, 10) : '',
    occupation: row.occupation ?? '',
    nationality: row.nationality || 'Indian',
    pan_number: row.pan_number ?? '',
    aadhaar_last4: row.aadhaar_last4 ?? '',
    guardian_name: row.guardian_name ?? '',
    residential_status: row.residential_status || 'Resident Indian',
    passport_number: row.passport_number ?? '',
    office_name_address: row.office_name_address ?? ''
  };
}

export const EMPTY_ADDRESS: AddressFormValues = {
  kind: 'current',
  address_line1: '',
  city: '',
  state: '',
  pin: ''
};

export function addressValuesFromRow(row: {
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
}): AddressFormValues {
  return {
    kind: row.kind === 'permanent' ? 'permanent' : 'current',
    address_line1: row.address_line1 ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    pin: row.pin ?? ''
  };
}

export const EMPTY_NOMINEE: NomineeFormValues = {
  nominee_name: '',
  relationship: '',
  nominee_dob: ''
};

export function nomineeValuesFromRow(row: {
  nominee_name: string | null;
  relationship: string | null;
  nominee_dob: string | null;
}): NomineeFormValues {
  return {
    nominee_name: row.nominee_name ?? '',
    relationship: row.relationship ?? '',
    nominee_dob: row.nominee_dob ? String(row.nominee_dob).slice(0, 10) : ''
  };
}

export const EMPTY_BANK: BankFormValues = {
  bank_name: '',
  account_no: '',
  ifsc: '',
  branch: ''
};

export function bankValuesFromRow(row: {
  bank_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  branch: string | null;
}): BankFormValues {
  return {
    bank_name: row.bank_name ?? '',
    account_no: row.account_no ?? '',
    ifsc: row.ifsc ?? '',
    branch: row.branch ?? ''
  };
}

export function kycIdentityValuesFromCustomer(row: {
  pan_number: string | null;
  aadhaar_last4: string | null;
}): KycIdentityFormValues {
  return {
    pan_number: row.pan_number ?? '',
    aadhaar_last4: row.aadhaar_last4 ?? ''
  };
}

/** Payload helpers after successful parse */
export function customerCreatePayload(values: CustomerCreateFormValues) {
  return {
    full_name: values.full_name.trim(),
    phone: normalizePhoneDigits(values.phone),
    email: values.email.trim() || null,
    dob: values.dob || null,
    occupation: values.occupation || null,
    nationality: values.nationality || null,
    guardian_name: values.guardian_name.trim() || null,
    residential_status: values.residential_status || null,
    passport_number: values.passport_number.trim() || null,
    office_name_address: values.office_name_address.trim() || null
  };
}

export function customerEditPayload(values: CustomerEditFormValues) {
  return {
    ...customerCreatePayload(values),
    pan_number: normalizePan(values.pan_number) || null,
    aadhaar_last4: normalizeAadhaarLast4(values.aadhaar_last4) || null
  };
}
