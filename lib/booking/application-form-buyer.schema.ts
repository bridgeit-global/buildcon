import { isValidDobIso } from '@/lib/date-input-value';
import {
  defaultIdProofForResidentialStatus,
  idProofOptionsForResidentialStatus,
  isNriResidentialStatus
} from '@/lib/customer/id-proof-options';
import {
  isPassportValid,
  normalizePassport,
  passportValidationMessage
} from '@/lib/customer/kyc-identifiers';
import { isPhoneLengthValidForCountry, phoneLengthErrorMessage } from '@/lib/form/common-fields';

export type ApplicationFormAddress = {
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

export type ApplicationFormBuyerInput = {
  first_name: string;
  middle_name: string;
  last_name: string;
  phone: string | null;
  phone_country?: string | null;
  phone_secondary: string | null;
  phone_secondary_country?: string | null;
  email: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  dob: string | null;
  nationality: string | null;
  residential_status: string | null;
  id_proof_type: string | null;
  passport_number?: string | null;
  pan: string;
  aadhaarLast4: string;
  residentialAddress: ApplicationFormAddress | null;
  permanentAddress: ApplicationFormAddress | null;
  permanentSameAsCorrespondence: 'same' | 'different';
};

function normalizePhoneDigits(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

function validateAddress(
  addr: ApplicationFormAddress | null | undefined,
  prefix: string
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!addr?.address_line1?.trim()) {
    errors[`${prefix}_line1`] = 'Address line 1 is required.';
  }
  if (!addr?.pin?.trim() || !/^\d{6}$/.test(addr.pin.trim())) {
    errors[`${prefix}_pin`] = 'Enter a valid 6-digit PIN code.';
  }
  if (!addr?.state?.trim()) {
    errors[`${prefix}_state`] = 'State is required.';
  }
  return errors;
}

export function addressesMatch(
  a: ApplicationFormAddress | null | undefined,
  b: ApplicationFormAddress | null | undefined
): boolean {
  if (!a || !b) return false;
  const fields = [
    'address_line1',
    'address_line2',
    'address_line3',
    'city',
    'state',
    'pin'
  ] as const;
  return fields.every(
    (f) => String(a[f] ?? '').trim() === String(b[f] ?? '').trim()
  );
}

export function inferPermanentSameAsCorrespondence(
  residential: ApplicationFormAddress | null | undefined,
  permanent: ApplicationFormAddress | null | undefined
): 'same' | 'different' {
  if (!permanent?.address_line1?.trim()) return 'same';
  if (addressesMatch(residential, permanent)) return 'same';
  return 'different';
}

export function validateApplicationFormBuyer(
  b: ApplicationFormBuyerInput
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!b.first_name.trim()) errors.first_name = 'First name is required.';
  if (!b.last_name.trim()) errors.last_name = 'Last name is required.';
  if (!b.guardian_relation?.trim()) {
    errors.guardian_relation = 'Customer relation is required.';
  }
  if (!b.guardian_name?.trim()) {
    errors.guardian_name = 'Guardian name is required.';
  }

  if (!b.dob) errors.dob = 'Date of birth is required.';
  else if (!isValidDobIso(b.dob)) {
    errors.dob = 'Enter a valid date of birth.';
  }

  const primaryDigits = normalizePhoneDigits(b.phone);
  if (!isPhoneLengthValidForCountry(b.phone, b.phone_country)) {
    errors.phone = phoneLengthErrorMessage(b.phone_country);
  }
  const secondaryDigits = normalizePhoneDigits(b.phone_secondary);
  if (
    secondaryDigits &&
    !isPhoneLengthValidForCountry(b.phone_secondary, b.phone_secondary_country)
  ) {
    errors.phone_secondary = phoneLengthErrorMessage(b.phone_secondary_country);
  }
  if (
    secondaryDigits &&
    primaryDigits &&
    secondaryDigits === primaryDigits
  ) {
    errors.phone_secondary = 'Secondary mobile must differ from primary.';
  }

  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!b.pan.trim()) errors.pan = 'PAN is required.';
  if (!b.aadhaarLast4.trim()) errors.aadhaar = 'Aadhaar number is required.';
  if (!b.nationality?.trim()) errors.nationality = 'Nationality is required.';
  if (!b.residential_status?.trim()) {
    errors.residential_status = 'Residential status is required.';
  }

  if (isNriResidentialStatus(b.residential_status)) {
    const passport = normalizePassport(b.passport_number ?? '');
    if (!passport) {
      errors.passport_number = 'Passport number is required for NRI / foreign applicants.';
    } else if (!isPassportValid(passport, b.residential_status)) {
      errors.passport_number = passportValidationMessage(b.residential_status);
    }
  } else {
    const passport = normalizePassport(b.passport_number ?? '');
    if (passport && !isPassportValid(passport, b.residential_status)) {
      errors.passport_number = passportValidationMessage(b.residential_status);
    }
  }

  Object.assign(errors, validateAddress(b.residentialAddress, 'res_address'));

  if (b.permanentSameAsCorrespondence === 'different') {
    Object.assign(errors, validateAddress(b.permanentAddress, 'perm_address'));
  }

  return errors;
}

export function effectivePermanentAddress(
  b: ApplicationFormBuyerInput
): ApplicationFormAddress | null {
  if (b.permanentSameAsCorrespondence === 'same') {
    return b.residentialAddress;
  }
  return b.permanentAddress;
}

export function residentialStatusPatch(
  prevStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  prevProof: string | null | undefined
): { residential_status: string; id_proof_type: string } {
  const status = String(nextStatus ?? '').trim();
  const allowed = idProofOptionsForResidentialStatus(status);
  const current = String(prevProof ?? '').trim();
  if (allowed.includes(current)) {
    return { residential_status: status, id_proof_type: current };
  }
  return {
    residential_status: status,
    id_proof_type: defaultIdProofForResidentialStatus(status)
  };
}
