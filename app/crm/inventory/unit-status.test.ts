import { describe, expect, it } from 'vitest';
import {
  BOOKING_CREATE_UNIT_STATUS_FILTER,
  STATUS_COLOR,
  STATUS_LABEL,
  UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE,
  UNIT_STATUS_CODES,
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  isUnitBookableForWorkflow,
  isUnitBookedOrBeyond,
  isUnitLinkedToBookingRecord,
  isUnitPossessedStatus,
  isUnitPrefillableFromInquiry,
  isUnitSelectableForBookingCreate,
  isUnitSelectableForInquiry,
  isUnitTokenReceivedStatus,
  normalizeUnitStatusCode,
  statusLabelForUnit,
  unitStatusFromBookingUnitsJoin,
  unitStatusGridAbbrev
} from './unit-status';

describe('UNIT_STATUS_CODES', () => {
  it('contains every canonical lifecycle code in order', () => {
    expect(UNIT_STATUS_CODES).toEqual([
      'AVAILABLE',
      'BLOCKED',
      'TOKEN',
      'BOOKED',
      'AGREEMENT',
      'REGISTERED',
      'PRE_POSSESSION',
      'POSSESSED',
      'CANCELLED'
    ]);
  });
});

describe('STATUS_LABEL', () => {
  it.each([
    ['AVAILABLE', 'Available'],
    ['BLOCKED', 'Blocked'],
    ['TOKEN', 'Token received'],
    ['BOOKED', 'Booked'],
    ['AGREEMENT', 'Agreement done'],
    ['REGISTERED', 'Registered'],
    ['PRE_POSSESSION', 'Possession ready'],
    ['POSSESSED', 'Possession given'],
    ['CANCELLED', 'Cancelled'],
    ['A', 'Available'],
    ['BL', 'Blocked'],
    ['B', 'Booked'],
    ['S', 'Registered'],
    ['RF', 'Available']
  ] as const)('maps %s to %s', (code, label) => {
    expect(STATUS_LABEL[code]).toBe(label);
  });
});

describe('STATUS_COLOR', () => {
  it.each([
    ['AVAILABLE', 'var(--ds-success-500)'],
    ['BLOCKED', 'var(--ds-gray-500)'],
    ['TOKEN', 'var(--ds-warning-600)'],
    ['BOOKED', 'var(--ds-primary-500)'],
    ['AGREEMENT', 'var(--ds-primary-700)'],
    ['REGISTERED', 'var(--ds-primary-400)'],
    ['PRE_POSSESSION', 'var(--ds-primary-600)'],
    ['POSSESSED', 'var(--ds-warning-800)'],
    ['CANCELLED', 'var(--ds-error-600)'],
    ['A', 'var(--ds-success-500)'],
    ['BL', 'var(--ds-gray-500)'],
    ['B', 'var(--ds-primary-500)'],
    ['S', 'var(--ds-primary-400)']
  ] as const)('maps %s to %s', (code, color) => {
    expect(STATUS_COLOR[code]).toBe(color);
  });
});

describe('normalizeUnitStatusCode', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['  ', ''],
    ['available', 'AVAILABLE'],
    [' blocked ', 'BLOCKED'],
    ['Token', 'TOKEN'],
    ['pre_possession', 'PRE_POSSESSION']
  ] as const)('normalizeUnitStatusCode(%j) => %j', (input, expected) => {
    expect(normalizeUnitStatusCode(input)).toBe(expected);
  });
});

describe('isUnitAvailableForBooking', () => {
  it.each([
    ['AVAILABLE', true],
    ['available', true],
    ['A', true],
    ['a', true],
    ['BLOCKED', false],
    ['BL', false],
    ['TOKEN', false],
    ['BOOKED', false],
    ['B', false],
    ['S', false],
    ['RF', false],
    [null, false],
    ['', false]
  ] as const)('isUnitAvailableForBooking(%j) => %s', (status, expected) => {
    expect(isUnitAvailableForBooking(status)).toBe(expected);
  });
});

describe('isUnitBlockedStatus', () => {
  it.each([
    ['BLOCKED', true],
    ['blocked', true],
    ['BL', true],
    ['AVAILABLE', false],
    ['A', false],
    ['TOKEN', false],
    [null, false]
  ] as const)('isUnitBlockedStatus(%j) => %s', (status, expected) => {
    expect(isUnitBlockedStatus(status)).toBe(expected);
  });
});

describe('isUnitTokenReceivedStatus', () => {
  it.each([
    ['TOKEN', true],
    ['token', true],
    [' TOKEN ', true],
    ['AVAILABLE', false],
    ['BLOCKED', false],
    [null, false]
  ] as const)('isUnitTokenReceivedStatus(%j) => %s', (status, expected) => {
    expect(isUnitTokenReceivedStatus(status)).toBe(expected);
  });
});

describe('isUnitBookableForWorkflow', () => {
  it.each([
    ['AVAILABLE', true],
    ['A', true],
    ['a', true],
    ['BLOCKED', true],
    ['BL', true],
    ['TOKEN', true],
    ['BOOKED', false],
    ['B', false],
    ['CANCELLED', false],
    [null, false]
  ] as const)('isUnitBookableForWorkflow(%j) => %s', (status, expected) => {
    expect(isUnitBookableForWorkflow(status)).toBe(expected);
  });
});

describe('isUnitPrefillableFromInquiry', () => {
  it.each([
    ['BLOCKED', true],
    ['BL', true],
    ['AVAILABLE', false],
    ['TOKEN', false],
    ['BOOKED', false]
  ] as const)('isUnitPrefillableFromInquiry(%j) => %s', (status, expected) => {
    expect(isUnitPrefillableFromInquiry(status)).toBe(expected);
  });
});

describe('isUnitSelectableForBookingCreate', () => {
  it.each([
    ['BLOCKED', true],
    ['BL', true],
    ['AVAILABLE', false],
    ['TOKEN', false]
  ] as const)('isUnitSelectableForBookingCreate(%j) => %s', (status, expected) => {
    expect(isUnitSelectableForBookingCreate(status)).toBe(expected);
  });
});

describe('BOOKING_CREATE_UNIT_STATUS_FILTER', () => {
  it('includes canonical and legacy blocked codes', () => {
    expect(BOOKING_CREATE_UNIT_STATUS_FILTER).toEqual(['BLOCKED', 'BL']);
  });
});

describe('isUnitSelectableForInquiry', () => {
  it.each([
    ['AVAILABLE', true],
    ['available', true],
    ['A', true],
    ['BLOCKED', true],
    ['BL', true],
    ['TOKEN', true],
    ['BOOKED', false],
    ['B', false],
    ['AGREEMENT', false],
    ['CANCELLED', false],
    [null, false]
  ] as const)('isUnitSelectableForInquiry(%j) => %s', (status, expected) => {
    expect(isUnitSelectableForInquiry(status)).toBe(expected);
  });
});

describe('isUnitBookedOrBeyond', () => {
  it.each([
    ['TOKEN', true],
    ['BOOKED', true],
    ['B', true],
    ['AGREEMENT', true],
    ['REGISTERED', true],
    ['S', true],
    ['PRE_POSSESSION', true],
    ['POSSESSED', true],
    ['AVAILABLE', false],
    ['BLOCKED', false],
    ['CANCELLED', false],
    [null, false]
  ] as const)('isUnitBookedOrBeyond(%j) => %s', (status, expected) => {
    expect(isUnitBookedOrBeyond(status)).toBe(expected);
  });
});

describe('isUnitLinkedToBookingRecord', () => {
  it.each([
    ['BOOKED', true],
    ['B', true],
    ['AGREEMENT', true],
    ['REGISTERED', true],
    ['S', true],
    ['PRE_POSSESSION', true],
    ['POSSESSED', true],
    ['TOKEN', false],
    ['AVAILABLE', false],
    ['BLOCKED', false],
    [null, false]
  ] as const)('isUnitLinkedToBookingRecord(%j) => %s', (status, expected) => {
    expect(isUnitLinkedToBookingRecord(status)).toBe(expected);
  });
});

describe('isUnitPossessedStatus', () => {
  it.each([
    ['POSSESSED', true],
    ['possessed', true],
    ['PRE_POSSESSION', false],
    ['BOOKED', false],
    [null, false]
  ] as const)('isUnitPossessedStatus(%j) => %s', (status, expected) => {
    expect(isUnitPossessedStatus(status)).toBe(expected);
  });
});

describe('UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE', () => {
  it('is the expected user-facing message', () => {
    expect(UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE).toBe(
      'This unit is marked as Possession given — documents cannot be generated.'
    );
  });
});

describe('unitStatusFromBookingUnitsJoin', () => {
  it.each([
    [null, null],
    [undefined, null],
    [{ status: 'BOOKED' }, 'BOOKED'],
    [[{ status: 'TOKEN' }], 'TOKEN'],
    [[], null],
    [{ status: '' }, '']
  ] as const)('unitStatusFromBookingUnitsJoin(%j) => %j', (units, expected) => {
    expect(unitStatusFromBookingUnitsJoin(units)).toBe(expected);
  });
});

describe('unitStatusGridAbbrev', () => {
  it.each([
    ['AVAILABLE', 'AV'],
    ['BLOCKED', 'BL'],
    ['TOKEN', 'TK'],
    ['BOOKED', 'BK'],
    ['AGREEMENT', 'AG'],
    ['REGISTERED', 'RG'],
    ['PRE_POSSESSION', 'PP'],
    ['POSSESSED', 'PC'],
    ['CANCELLED', 'CX'],
    ['A', 'A'],
    ['BL', 'BL'],
    ['UNKNOWN_LONG', 'UN'],
    [null, '']
  ] as const)('unitStatusGridAbbrev(%j) => %j', (status, expected) => {
    expect(unitStatusGridAbbrev(status)).toBe(expected);
  });
});

describe('statusLabelForUnit', () => {
  it.each([
    ['AVAILABLE', 'Available'],
    ['available', 'Available'],
    ['A', 'Available'],
    ['BL', 'Blocked'],
    ['B', 'Booked'],
    ['S', 'Registered'],
    ['RF', 'Available'],
    ['TOKEN', 'Token received'],
    ['POSSESSED', 'Possession given'],
    ['UNKNOWN_CODE', 'UNKNOWN_CODE'],
    [null, '—'],
    ['', '—'],
    ['  ', '—']
  ] as const)('statusLabelForUnit(%j) => %j', (status, expected) => {
    expect(statusLabelForUnit(status)).toBe(expected);
  });

  it.each(UNIT_STATUS_CODES)('has a label for canonical code %s', (code) => {
    expect(statusLabelForUnit(code)).toBe(STATUS_LABEL[code]);
  });
});
