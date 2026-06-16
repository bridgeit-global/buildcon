import { describe, expect, it } from 'vitest';
import { collectionEntrySchema } from './collection-entry.schema';

describe('collectionEntrySchema', () => {
  const validCash = {
    entryAmount: '25000',
    entryDate: '2026-06-01',
    entryMode: 'Cash',
    entryRef: ''
  };

  it('accepts cash entry without reference', () => {
    expect(collectionEntrySchema.safeParse(validCash).success).toBe(true);
  });

  it('rejects non-positive amount', () => {
    expect(
      collectionEntrySchema.safeParse({ ...validCash, entryAmount: '0' }).success
    ).toBe(false);
  });

  it('rejects missing date', () => {
    expect(
      collectionEntrySchema.safeParse({ ...validCash, entryDate: '' }).success
    ).toBe(false);
  });

  it('requires reference for non-cash modes', () => {
    const result = collectionEntrySchema.safeParse({
      ...validCash,
      entryMode: 'UPI',
      entryRef: ''
    });
    expect(result.success).toBe(false);
  });

  it('accepts UPI with reference', () => {
    const result = collectionEntrySchema.safeParse({
      ...validCash,
      entryMode: 'UPI',
      entryRef: 'UTR998877'
    });
    expect(result.success).toBe(true);
  });
});
