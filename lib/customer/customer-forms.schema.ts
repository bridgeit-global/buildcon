import { z } from 'zod';
import { isIsoDateNotAfterToday, isValidDobIso } from '@/lib/date-input-value';
import {
  idProofOptionsForResidentialStatus,
  isNriResidentialStatus
} from '@/lib/customer/id-proof-options';
import {
  isAadhaarValid,
  isPanValid,
  normalizeAadhaar,
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

const optionalPhone10 = z.string().refine(
  (v) => {
    const d = normalizePhoneDigits(v);
    return d.length === 0 || d.length === 10;
  },
  { message: 'Enter a 10-digit mobile number.' }
);

const optionalDobField = z.string().refine(
  (v) => {
    const t = v.trim();
    if (!t) return true;
    return isValidDobIso(t);
  },
  { message: 'Enter a valid date of birth.' }
);

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

const optionalAadhaar = z.string().refine(
  (v) => {
    const raw = String(v ?? '').trim();
    return !raw || isAadhaarValid(raw);
  },
  { message: 'Aadhaar must be 12 digits.' }
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

/** Address lines + PIN + state (no city) — used on customer create and application forms */
export const applicationAddressFieldsSchema = z.object({
  address_line1: z.string().trim().min(1, 'Address line 1 is required.'),
  address_line2: z.string().trim().min(1, 'Address line 2 is required.'),
  address_line3: z.string().trim().min(1, 'Address line 3 is required.'),
  state: z.string().trim().min(1, 'State is required.'),
  pin: z.string().trim().refine((v) => /^\d{6}$/.test(v), {
    message: 'Enter a 6-digit PIN code.'
  })
});

const optionalApplicationAddressFields = z.object({
  address_line1: z.string(),
  address_line2: z.string(),
  address_line3: z.string(),
  state: z.string(),
  pin: z.string()
});

export const EMPTY_APPLICATION_ADDRESS: z.infer<
  typeof applicationAddressFieldsSchema
> = {
  address_line1: '',
  address_line2: '',
  address_line3: '',
  state: '',
  pin: ''
};

const optionalPastDate = z.string().refine(isIsoDateNotAfterToday, {
  message: 'Date of birth cannot be in the future.'
});

const customerProfileObject = z.object({
  full_name: z.string().trim().min(1, 'Customer name is required.'),
  phone: phone10,
  phone_secondary: optionalPhone10,
  email: optionalEmail,
  dob: optionalDobField,
  occupation: z.string(),
  nationality: z.string(),
  guardian_name: z.string(),
  guardian_relation: z.string(),
  residential_status: z.string(),
  passport_number: z.string(),
  id_proof_type: z.string(),
  office_name_address: z.string()
});

function refineCustomerProfile(
  data: z.infer<typeof customerProfileObject>,
  ctx: z.RefinementCtx
) {
  const primary = normalizePhoneDigits(data.phone);
  const secondary = normalizePhoneDigits(data.phone_secondary);
  if (secondary && primary && secondary === primary) {
    ctx.addIssue({
      code: 'custom',
      path: ['phone_secondary'],
      message: 'Secondary mobile must differ from primary.'
    });
  }
  const proof = String(data.id_proof_type ?? '').trim();
  if (proof && isNriResidentialStatus(data.residential_status)) {
    const allowed = idProofOptionsForResidentialStatus(data.residential_status);
    if (!allowed.includes(proof)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id_proof_type'],
        message: 'NRI / foreign applicants must use Passport as ID proof.'
      });
    }
  }
}

function refineCustomerCreateAddresses(
  data: z.infer<typeof customerProfileObject> & {
    residential_address: z.infer<typeof applicationAddressFieldsSchema>;
    permanent_same_as_correspondence: 'same' | 'different';
    permanent_address: z.infer<typeof optionalApplicationAddressFields>;
  },
  ctx: z.RefinementCtx
) {
  refineCustomerProfile(data, ctx);
  if (data.permanent_same_as_correspondence === 'different') {
    const result = applicationAddressFieldsSchema.safeParse(data.permanent_address);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['permanent_address', ...issue.path]
        });
      }
    }
  }
}

/** Add-customer dialog */
export const customerCreateSchema = customerProfileObject
  .extend({
    residential_address: applicationAddressFieldsSchema,
    permanent_same_as_correspondence: z.enum(['same', 'different']),
    permanent_address: optionalApplicationAddressFields
  })
  .superRefine(refineCustomerCreateAddresses);

/** Edit-customer dialog (includes KYC identifiers on profile) */
export const customerEditSchema = customerProfileObject
  .extend({
    pan_number: optionalPan,
    aadhaar_last4: optionalAadhaar
  })
  .superRefine(refineCustomerProfile);

const requiredPan = z.string().superRefine((v, ctx) => {
  const panNorm = normalizePan(v);
  if (!panNorm) {
    ctx.addIssue({ code: 'custom', message: 'PAN is required.' });
  } else if (!isPanValid(panNorm)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter a valid PAN (e.g. ABCDE1234F).'
    });
  }
});

const requiredAadhaar = z.string().superRefine((v, ctx) => {
  const raw = String(v ?? '').trim();
  if (!raw) {
    ctx.addIssue({ code: 'custom', message: 'Aadhaar number is required.' });
  } else if (!isAadhaarValid(raw)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Aadhaar must be 12 digits.'
    });
  }
});

/** KYC tab — PAN & Aadhaar required for profile KYC */
export const kycIdentitySchema = z.object({
  pan_number: requiredPan,
  aadhaar_last4: requiredAadhaar
});

/** Address dialog */
export const addressFormSchema = z.object({
  kind: addressKind,
  same_as_correspondence: z.boolean(),
  address_line1: z.string().trim().min(1, 'Address line 1 is required.'),
  address_line2: z.string().trim().min(1, 'Address line 2 is required.'),
  address_line3: z.string().trim().min(1, 'Address line 3 is required.'),
  city: z.string(),
  state: z.string().trim().min(1, 'State is required.'),
  pin: z.string().trim().refine((v) => /^\d{6}$/.test(v), {
    message: 'Enter a 6-digit PIN code.'
  })
});

/** Nominee dialog */
export const nomineeFormSchema = z.object({
  nominee_name: z.string().trim().min(1, 'Nominee name is required.'),
  relationship: z.string(),
  nominee_dob: optionalPastDate
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
    if (data.docType === 'aadhaar' && !isAadhaarValid(data.aadhaar_last4)) {
      ctx.addIssue({
        code: 'custom',
        path: ['aadhaar_last4'],
        message: 'Aadhaar must be 12 digits.'
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

export const DEFAULT_GUARDIAN_RELATION = 'Father';

export function guardianNameFieldLabel(
  relation: string | null | undefined
): string {
  const r = String(relation ?? '').trim() || DEFAULT_GUARDIAN_RELATION;
  if (r.toLowerCase() === 'other') return 'Guardian name';
  return `${r}'s name`;
}

export const EMPTY_CUSTOMER_CREATE: CustomerCreateFormValues = {
  full_name: '',
  phone: '',
  phone_secondary: '',
  email: '',
  dob: '',
  occupation: '',
  nationality: 'Indian',
  guardian_name: '',
  guardian_relation: DEFAULT_GUARDIAN_RELATION,
  residential_status: 'Resident Indian',
  passport_number: '',
  id_proof_type: '',
  office_name_address: '',
  residential_address: { ...EMPTY_APPLICATION_ADDRESS },
  permanent_same_as_correspondence: 'same',
  permanent_address: { ...EMPTY_APPLICATION_ADDRESS }
};

export function customerEditValuesFromCustomer(row: {
  full_name: string;
  phone: string | null;
  phone_secondary?: string | null;
  email: string | null;
  dob: string | null;
  occupation: string | null;
  nationality: string | null;
  pan_number: string | null;
  aadhaar_last4: string | null;
  guardian_name: string | null;
  guardian_relation?: string | null;
  residential_status: string | null;
  passport_number: string | null;
  id_proof_type?: string | null;
  office_name_address: string | null;
}): CustomerEditFormValues {
  return {
    full_name: row.full_name,
    phone: row.phone ?? '',
    phone_secondary: row.phone_secondary ?? '',
    email: row.email ?? '',
    dob: row.dob ? String(row.dob).slice(0, 10) : '',
    occupation: row.occupation ?? '',
    nationality: row.nationality || 'Indian',
    pan_number: row.pan_number ?? '',
    aadhaar_last4: row.aadhaar_last4 ?? '',
    guardian_name: row.guardian_name ?? '',
    guardian_relation: row.guardian_relation?.trim() || DEFAULT_GUARDIAN_RELATION,
    residential_status: row.residential_status || 'Resident Indian',
    passport_number: row.passport_number ?? '',
    id_proof_type: row.id_proof_type ?? '',
    office_name_address: row.office_name_address ?? ''
  };
}

export const EMPTY_ADDRESS: AddressFormValues = {
  kind: 'current',
  same_as_correspondence: false,
  address_line1: '',
  address_line2: '',
  address_line3: '',
  city: '',
  state: '',
  pin: ''
};

export function addressValuesFromRow(row: {
  kind: string;
  address_line1: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
}): AddressFormValues {
  return {
    kind: row.kind === 'permanent' ? 'permanent' : 'current',
    same_as_correspondence: false,
    address_line1: row.address_line1 ?? '',
    address_line2: row.address_line2 ?? '',
    address_line3: row.address_line3 ?? '',
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
    phone_secondary: normalizePhoneDigits(values.phone_secondary) || null,
    email: values.email.trim() || null,
    dob: values.dob || null,
    occupation: values.occupation || null,
    nationality: values.nationality || null,
    guardian_name: values.guardian_name.trim() || null,
    guardian_relation: values.guardian_relation.trim() || null,
    residential_status: values.residential_status || null,
    passport_number: values.passport_number.trim() || null,
    id_proof_type: values.id_proof_type.trim() || null,
    office_name_address: values.office_name_address.trim() || null
  };
}

function applicationAddressToDbRow(
  addr: z.infer<typeof applicationAddressFieldsSchema>
) {
  return {
    address_line1: addr.address_line1.trim(),
    address_line2: addr.address_line2.trim() || null,
    address_line3: addr.address_line3.trim() || null,
    state: addr.state.trim() || null,
    pin: addr.pin.trim() || null,
    city: null as string | null
  };
}

/** Correspondence (current) + permanent rows for customer_addresses after create */
export function customerCreateAddressesPayload(values: CustomerCreateFormValues) {
  const correspondence = applicationAddressToDbRow(values.residential_address);
  const permanent =
    values.permanent_same_as_correspondence === 'same'
      ? correspondence
      : applicationAddressToDbRow(values.permanent_address);
  return { correspondence, permanent };
}

export function customerEditPayload(values: CustomerEditFormValues) {
  return {
    ...customerCreatePayload(values),
    pan_number: normalizePan(values.pan_number) || null,
    aadhaar_last4: normalizeAadhaar(values.aadhaar_last4) || null
  };
}
