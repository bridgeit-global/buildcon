import { describe, expect, it } from 'vitest';
import { extractAadhaarFromText, extractPanFromText } from './kyc-ocr';

describe('extractPanFromText', () => {
  it('extracts a spaced PAN', () => {
    expect(extractPanFromText('Income Tax PAN ABCDE 1234 F')).toBe('ABCDE1234F');
  });

  it('extracts a compact PAN from noisy OCR', () => {
    expect(extractPanFromText('Name: Riyaz\nPAN: abcde1234f\nDOB')).toBe(
      'ABCDE1234F'
    );
  });

  it('skips masked PAN placeholders', () => {
    expect(extractPanFromText('XXXXX1234X and ABCDE1234F')).toBe('ABCDE1234F');
  });

  it('returns null when no valid PAN', () => {
    expect(extractPanFromText('no pan here 12345')).toBeNull();
  });
});

describe('extractAadhaarFromText', () => {
  it('extracts grouped Aadhaar', () => {
    expect(extractAadhaarFromText('UID 1234 5678 9012')).toBe('123456789012');
  });

  it('extracts plain 12 digits', () => {
    expect(extractAadhaarFromText('Aadhaar: 123456789012')).toBe('123456789012');
  });

  it('skips masked Aadhaar groups', () => {
    expect(extractAadhaarFromText('XXXX XXXX 1234\n1234 5678 9012')).toBe(
      '123456789012'
    );
  });

  it('returns null when no valid Aadhaar', () => {
    expect(extractAadhaarFromText('only 1234')).toBeNull();
  });
});
