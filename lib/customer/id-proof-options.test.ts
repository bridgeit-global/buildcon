import { describe, expect, it } from 'vitest';
import {
  defaultIdProofForResidentialStatus,
  idProofOptionsForResidentialStatus,
  isNriResidentialStatus
} from './id-proof-options';

describe('isNriResidentialStatus', () => {
  it('detects NRI and foreign national', () => {
    expect(isNriResidentialStatus('NRI')).toBe(true);
    expect(isNriResidentialStatus('Foreign National')).toBe(true);
    expect(isNriResidentialStatus('Resident Indian')).toBe(false);
  });
});

describe('idProofOptionsForResidentialStatus', () => {
  it('returns only passport for NRI', () => {
    expect(idProofOptionsForResidentialStatus('NRI')).toEqual(['Passport']);
  });

  it('returns full list for resident Indian', () => {
    expect(idProofOptionsForResidentialStatus('Resident Indian').length).toBeGreaterThan(
      1
    );
  });
});

describe('defaultIdProofForResidentialStatus', () => {
  it('defaults to passport for NRI', () => {
    expect(defaultIdProofForResidentialStatus('NRI')).toBe('Passport');
  });
});
