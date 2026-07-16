import { describe, expect, it } from 'vitest';
import { extractAadhaarFromText, extractPanFromText } from './kyc-ocr-extract';
import { __test as aiTest } from './kyc-ocr-ai';

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

describe('kyc-ocr-ai parseModelJson', () => {
  it('parses valid JSON with identifiers', () => {
    const parsed = aiTest.parseModelJson(
      JSON.stringify({
        pan: 'ABCDE1234F',
        aadhaar: null,
        text: 'PAN CARD',
        rotation_deg: 90
      })
    );
    expect(parsed.pan).toBe('ABCDE1234F');
    expect(parsed.aadhaar).toBeNull();
    expect(parsed.rotationDeg).toBe(90);
  });

  it('falls back to regex when JSON is invalid', () => {
    const parsed = aiTest.parseModelJson('Here is PAN ABCDE1234F on the card');
    expect(parsed.pan).toBe('ABCDE1234F');
  });

  it('defaults unknown provider to gemini', () => {
    expect(aiTest.parseProvider('weird')).toBe('gemini');
    expect(aiTest.parseProvider(undefined)).toBe('gemini');
    expect(aiTest.parseProvider('openai')).toBe('openai');
  });
});
