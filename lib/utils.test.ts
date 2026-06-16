import { describe, expect, it } from 'vitest';
import { cn, shortId, userFacingError, withoutDbIds } from './utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2 py-1', false && 'hidden', 'px-4')).toBe('py-1 px-4');
  });
});

describe('shortId', () => {
  it('returns first 8 characters uppercased', () => {
    expect(shortId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('A1B2C3D4');
  });
});

describe('withoutDbIds', () => {
  it('removes UUIDs from text', () => {
    expect(
      withoutDbIds('Failed for booking a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    ).toBe('Failed for booking');
  });

  it('collapses extra whitespace', () => {
    expect(withoutDbIds('Error   with   spaces')).toBe('Error with spaces');
  });
});

describe('userFacingError', () => {
  it('returns fallback for empty message', () => {
    expect(userFacingError(null, 'Something went wrong.')).toBe('Something went wrong.');
  });

  it('strips UUIDs and falls back when nothing remains', () => {
    expect(
      userFacingError('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Something went wrong.')
    ).toBe('Something went wrong.');
  });

  it('returns cleaned message when text remains', () => {
    expect(userFacingError('Invalid booking amount.', 'Fallback')).toBe('Invalid booking amount.');
  });
});
