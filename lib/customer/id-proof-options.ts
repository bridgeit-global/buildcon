export const ID_PROOF_OPTIONS = [
  'Aadhaar Card',
  'PAN Card',
  'Passport',
  'Voter ID Card',
  'Driving License',
  'OCI / PIO Card'
] as const;

export type IdProofOption = (typeof ID_PROOF_OPTIONS)[number];

export const NRI_ID_PROOF_OPTIONS = ['Passport'] as const;

export function isNriResidentialStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'nri' || s === 'foreign national';
}

export function idProofOptionsForResidentialStatus(
  status: string | null | undefined
): readonly string[] {
  return isNriResidentialStatus(status) ? NRI_ID_PROOF_OPTIONS : ID_PROOF_OPTIONS;
}

export function defaultIdProofForResidentialStatus(
  status: string | null | undefined
): string {
  return isNriResidentialStatus(status) ? 'Passport' : '';
}
