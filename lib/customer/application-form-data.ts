import { maskAadhaarLast4 } from '@/lib/customer/kyc-identifiers';

export type CustomerAddressSnippet = {
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

export type CustomerApplicationProfile = {
  id: string;
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
};

export function formatCustomerAddress(
  addr:
    | Pick<CustomerAddressSnippet, 'address_line1' | 'city' | 'state' | 'pin'>
    | null
    | undefined
): string {
  if (!addr) return '';
  return [addr.address_line1, addr.city, addr.state, addr.pin]
    .filter(Boolean)
    .join(', ');
}

export function pickCustomerAddress(
  addresses: CustomerAddressSnippet[] | null | undefined,
  kind: 'current' | 'permanent'
): CustomerAddressSnippet | null {
  const rows = addresses ?? [];
  return rows.find((a) => a.kind === kind) ?? null;
}

export function formatDobForForm(dob: string | null | undefined): string {
  if (!dob) return '—';
  const d = new Date(String(dob).slice(0, 10));
  if (Number.isNaN(d.getTime())) return String(dob);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export const RESIDENTIAL_STATUS_OPTIONS = [
  'Resident Indian',
  'NRI',
  'Foreign National'
] as const;

export type ApplicationFormApplicantRow = {
  role: string;
  customerId: string;
  fullName: string;
  guardianName: string;
  dob: string;
  pan: string;
  aadhaar: string;
  nationality: string;
  residentialStatus: string;
  profession: string;
  passportNo: string;
  permanentAddress: string;
  mobile: string;
  email: string;
  communicationAddress: string;
  officeNameAddress: string;
};

export function buildApplicantRows(
  buyers: { id: string; label: string }[],
  profiles: Map<string, CustomerApplicationProfile>,
  addressesByCustomer: Map<string, CustomerAddressSnippet[]>
): ApplicationFormApplicantRow[] {
  return buyers.map((b, index) => {
    const p = profiles.get(b.id);
    const addrs = addressesByCustomer.get(b.id) ?? [];
    const permanent = pickCustomerAddress(addrs, 'permanent');
    const current = pickCustomerAddress(addrs, 'current');
    const role =
      index === 0
        ? '1st Applicant (Sole/First)'
        : index === 1
          ? '2nd Applicant'
          : '3rd Applicant';

    return {
      role,
      customerId: b.id,
      fullName: p?.full_name ?? b.label,
      guardianName: p?.guardian_name?.trim() || '—',
      dob: formatDobForForm(p?.dob ?? null),
      pan: p?.pan_number?.trim() || '—',
      aadhaar: maskAadhaarLast4(p?.aadhaar_last4),
      nationality: p?.nationality?.trim() || '—',
      residentialStatus: p?.residential_status?.trim() || '—',
      profession: p?.occupation?.trim() || '—',
      passportNo: p?.passport_number?.trim() || '—',
      permanentAddress: formatCustomerAddress(permanent) || '—',
      mobile: p?.phone?.trim() || '—',
      email: p?.email?.trim() || '—',
      communicationAddress:
        formatCustomerAddress(current) || formatCustomerAddress(permanent) || '—',
      officeNameAddress: p?.office_name_address?.trim() || '—'
    };
  });
}
