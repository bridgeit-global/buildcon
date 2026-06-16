import { describe, expect, it } from 'vitest';
import {
  agreementValueLac,
  formatFloorChipLabel,
  formatFloorLabel,
  isParkingType
} from './inventory-utils';

describe('isParkingType', () => {
  it.each([
    ['Parking', true],
    ['parking', true],
    ['Car Parking', true],
    ['PARKING SLOT', true],
    ['2BHK', false],
    ['Shop', false],
    ['', false],
    [null, false],
    [undefined, false]
  ] as const)('isParkingType(%j) => %s', (typeValue, expected) => {
    expect(isParkingType(typeValue)).toBe(expected);
  });
});

describe('formatFloorLabel', () => {
  it.each([
    [null, null, 'Ground Floor'],
    [undefined, '2BHK', '—'],
    [NaN, '2BHK', '—'],
    [0, '2BHK', 'Ground Floor'],
    [1, '2BHK', 'Floor 1'],
    [12, 'Shop', 'Floor 12'],
    [-1, '2BHK', 'Parking B1'],
    [-2, '2BHK', 'Parking B2'],
    [1, 'Parking', 'Parking'],
    [0, 'Car Parking', 'Parking'],
    [5, 'parking slot', 'Parking']
  ] as const)(
    'formatFloorLabel(%j, %j) => %j',
    (floorValue, typeValue, expected) => {
      expect(formatFloorLabel(floorValue, typeValue)).toBe(expected);
    }
  );
});

describe('formatFloorChipLabel', () => {
  it.each([
    [null, null, 'GF'],
    [undefined, '2BHK', '—'],
    [NaN, '2BHK', '—'],
    [0, '2BHK', 'GF'],
    [1, '2BHK', 'F1'],
    [12, 'Shop', 'F12'],
    [-1, '2BHK', 'P-B1'],
    [-2, '2BHK', 'P-B2'],
    [1, 'Parking', 'Parking'],
    [0, 'Car Parking', 'Parking'],
    [5, 'parking slot', 'Parking']
  ] as const)(
    'formatFloorChipLabel(%j, %j) => %j',
    (floorValue, typeValue, expected) => {
      expect(formatFloorChipLabel(floorValue, typeValue)).toBe(expected);
    }
  );
});

describe('agreementValueLac', () => {
  it.each([
    [1000, 5000, 50],
    [500, 10000, 50],
    [0, 5000, 0],
    [1000, 0, 0],
    [null, 5000, 0],
    [1000, null, 0],
    [undefined, undefined, 0],
    [1500.5, 8000, (1500.5 * 8000) / 100000]
  ] as const)(
    'agreementValueLac(%j, %j) => %s',
    (area, rate, expected) => {
      expect(agreementValueLac(area, rate)).toBe(expected);
    }
  );
});
