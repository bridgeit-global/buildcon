import { describe, expect, it } from 'vitest';
import {
  csvNumeric,
  csvRowToUnitUpsert,
  normalizeCsvHeader,
  parseCsvRows
} from './inventory-csv';

describe('normalizeCsvHeader', () => {
  it.each([
    ['Unit Code', 'unit_code'],
    ['  Wing Name  ', 'wing_name'],
    ['Floor Rise Charge', 'floor_rise_charge'],
    ['Carpet (sq.ft.)', 'carpet_sqft'],
    ['Rate ₹/sq.ft.', 'rate_sqft'],
    ['', ''],
    ['A-B_C', 'ab_c'],
    ['Multiple   Spaces', 'multiple_spaces']
  ] as const)('normalizeCsvHeader(%j) => %j', (input, expected) => {
    expect(normalizeCsvHeader(input)).toBe(expected);
  });
});

describe('parseCsvRows', () => {
  it('returns empty array for empty text', () => {
    expect(parseCsvRows('')).toEqual([]);
    expect(parseCsvRows('   \n  ')).toEqual([]);
  });

  it('parses headers and rows with normalized keys', () => {
    const csv = [
      'Unit Code,Wing Name,Floor,Area,Rate',
      'A-101, Tower A ,3,1200,5000',
      'B-202,Tower B,4,1500,6000'
    ].join('\n');

    expect(parseCsvRows(csv)).toEqual([
      {
        unit_code: 'A-101',
        wing_name: 'Tower A',
        floor: '3',
        area: '1200',
        rate: '5000'
      },
      {
        unit_code: 'B-202',
        wing_name: 'Tower B',
        floor: '4',
        area: '1500',
        rate: '6000'
      }
    ]);
  });

  it('strips surrounding quotes from cell values', () => {
    const csv = 'Unit Code,Area\n"A-101","1200"\n';
    expect(parseCsvRows(csv)).toEqual([{ unit_code: 'A-101', area: '1200' }]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'Unit Code,Area\r\nA-101,1000\r\n';
    expect(parseCsvRows(csv)).toEqual([
      { unit_code: 'A-101', area: '1000' }
    ]);
  });

  it('skips blank lines and ignores empty header cells', () => {
    const csv = 'Unit Code,,Area\n\nA-101,,1000\n';
    expect(parseCsvRows(csv)).toEqual([{ unit_code: 'A-101', area: '1000' }]);
  });
});

describe('csvNumeric', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['1200', 1200],
    ['1,500.5', 1500.5],
    ['  2500  ', 2500],
    ['abc', null],
    ['12abc', null]
  ] as const)('csvNumeric(%j) => %j', (input, expected) => {
    expect(csvNumeric(input)).toBe(expected);
  });
});

describe('csvRowToUnitUpsert', () => {
  const projectId = 'proj-123';

  it('returns null when unit code is missing', () => {
    expect(csvRowToUnitUpsert(projectId, { wing_name: 'A' })).toBeNull();
    expect(csvRowToUnitUpsert(projectId, { unit_code: '   ' })).toBeNull();
  });

  it('maps primary and alternate column names with defaults', () => {
    const row = {
      code: ' U-1 ',
      structure: 'East',
      slot: '2',
      type: '2BHK',
      carpet: '900',
      bua: '1100',
      rera: '1000',
      terrace: '50',
      deck: '20',
      loading: '10',
      floor_rise: '100',
      plc: '200',
      parking: '1.8',
      status: 'available'
    };

    expect(csvRowToUnitUpsert(projectId, row)).toEqual({
      project_id: projectId,
      unit_code: 'U-1',
      wing_name: 'East',
      floor: 1,
      unit_no: 2,
      unit_type: '2BHK',
      area: 1,
      carpet_area: 900,
      bua_area: 1100,
      rera_area: 1000,
      terrace_sqft: 50,
      deck_sqft: 20,
      loading_sqft: 10,
      rate: 1,
      floor_rise_charge: 100,
      plc_charge: 200,
      parking_slots_included: 1,
      status: 'AVAILABLE'
    });
  });

  it.each([
    ['AVAILABLE', 'AVAILABLE'],
    ['blocked', 'BLOCKED'],
    ['INVALID', undefined],
    ['', undefined],
    ['TOKEN', 'TOKEN']
  ] as const)(
    'sets status only for canonical codes (%s => %s)',
    (statusInput, expectedStatus) => {
      const payload = csvRowToUnitUpsert(projectId, {
        unit_code: 'X-1',
        status: statusInput
      });
      expect(payload).not.toBeNull();
      if (expectedStatus === undefined) {
        expect(payload).not.toHaveProperty('status');
      } else {
        expect(payload!.status).toBe(expectedStatus);
      }
    }
  );

  it('uses explicit numeric fields and clamps parking slots', () => {
    const payload = csvRowToUnitUpsert(projectId, {
      unit_code: 'P-1',
      wing_name: 'West',
      floor: '5',
      unit_no: '10',
      unit_type: '3BHK',
      area: '1500',
      rate: '7000',
      parking_slots_included: '-3'
    });

    expect(payload).toEqual({
      project_id: projectId,
      unit_code: 'P-1',
      wing_name: 'West',
      floor: 5,
      unit_no: 10,
      unit_type: '3BHK',
      area: 1500,
      carpet_area: null,
      bua_area: null,
      rera_area: null,
      terrace_sqft: null,
      deck_sqft: null,
      loading_sqft: null,
      rate: 7000,
      floor_rise_charge: 0,
      plc_charge: 0,
      parking_slots_included: 0
    });
  });

  it('defaults wing_name to Default when absent', () => {
    const payload = csvRowToUnitUpsert(projectId, { unit_code: 'D-1' });
    expect(payload?.wing_name).toBe('Default');
  });
});
