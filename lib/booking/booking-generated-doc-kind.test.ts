import { describe, expect, it } from 'vitest';
import {
  BOOKING_DOCUMENT_KIND_LABEL,
  BOOKING_DOCUMENT_MATRIX_KINDS,
  generatedDemandExistsForSchedule,
  generatedReceiptExistsForCollection,
  parseKindFromBookingGeneratedPath,
  parseLinkIdFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';

describe('parseKindFromBookingGeneratedPath', () => {
  it('parses kind from html and pdf paths', () => {
    expect(
      parseKindFromBookingGeneratedPath('crm/bookings/b1/receipt--col1--abc.html')
    ).toBe('receipt');
    expect(
      parseKindFromBookingGeneratedPath('crm/bookings/b1/agreement--x--file.pdf')
    ).toBe('agreement');
  });

  it('returns null for unrecognized paths', () => {
    expect(parseKindFromBookingGeneratedPath('other/path/file.pdf')).toBeNull();
    expect(parseKindFromBookingGeneratedPath('')).toBeNull();
  });
});

describe('parseLinkIdFromBookingGeneratedPath', () => {
  it('extracts middle segment from three-part filenames', () => {
    expect(
      parseLinkIdFromBookingGeneratedPath(
        'crm/bookings/b1/receipt--collection-99--uuid.pdf'
      )
    ).toBe('collection-99');
  });

  it('returns null when filename does not match pattern', () => {
    expect(parseLinkIdFromBookingGeneratedPath('receipt.pdf')).toBeNull();
    expect(
      parseLinkIdFromBookingGeneratedPath('receipt--only-two.pdf')
    ).toBeNull();
  });
});

describe('generatedReceiptExistsForCollection', () => {
  it('detects receipt for a collection id', () => {
    const generated = [
      { storage_path: 'crm/b1/receipt--col-1--a.pdf' },
      { storage_path: 'crm/b1/demand-letter--sched-1--b.pdf' }
    ];
    expect(generatedReceiptExistsForCollection(generated, 'col-1')).toBe(true);
    expect(generatedReceiptExistsForCollection(generated, 'col-2')).toBe(false);
  });
});

describe('generatedDemandExistsForSchedule', () => {
  it('detects demand letter for a schedule id', () => {
    const generated = [
      { storage_path: 'crm/b1/demand-letter--sched-9--a.pdf' }
    ];
    expect(generatedDemandExistsForSchedule(generated, 'sched-9')).toBe(true);
    expect(generatedDemandExistsForSchedule(generated, 'sched-1')).toBe(false);
  });
});

describe('document kind constants', () => {
  it('labels every matrix kind', () => {
    for (const kind of BOOKING_DOCUMENT_MATRIX_KINDS) {
      expect(BOOKING_DOCUMENT_KIND_LABEL[kind]).toBeTruthy();
    }
  });
});
