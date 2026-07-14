import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildDraftFromUnitRows,
  buildProjectExcelTemplateWorkbook,
  parseFloorValue,
  parseProjectExcelWorkbook,
  PROJECT_EXCEL_PROJECT_SHEET,
  PROJECT_EXCEL_UNITS_SHEET
} from './project-excel';
import {
  countProjectUnits,
  getStructureLeaves
} from './project-structure-utils';

describe('parseFloorValue', () => {
  it('maps ground aliases to 0', () => {
    expect(parseFloorValue('GF')).toBe(0);
    expect(parseFloorValue('ground')).toBe(0);
    expect(parseFloorValue(0)).toBe(0);
  });

  it('parses floor numbers', () => {
    expect(parseFloorValue(2)).toBe(2);
    expect(parseFloorValue('Floor 3')).toBe(3);
  });

  it('rejects invalid values', () => {
    expect(parseFloorValue('')).toBeNull();
    expect(parseFloorValue('mezz')).toBeNull();
  });
});

describe('buildDraftFromUnitRows', () => {
  it('builds structure tree and floor provisions', () => {
    const built = buildDraftFromUnitRows(
      [
        {
          building: 'Tower 1',
          wing: 'Wing A',
          floor: 0,
          unit_no: 1,
          unit_name: 'A-GF01',
          unit_type: '1BHK',
          unit_category: 'Residential',
          carpet_area: 450,
          rate: 10000,
          parking_slots: 1
        },
        {
          building: 'Tower 1',
          wing: 'Wing A',
          floor: 1,
          unit_no: 1,
          unit_name: 'A-101',
          unit_type: '2BHK',
          unit_category: 'Residential',
          carpet_area: 650,
          rate: 11000
        },
        {
          building: 'Tower 1',
          wing: 'Wing B',
          floor: 1,
          unit_no: 1,
          unit_name: 'B-101',
          unit_type: '3BHK',
          unit_category: 'Residential',
          carpet_area: 900,
          rate: 12000,
          parking_slots: 2
        }
      ],
      10500
    );

    expect(built.structures).toHaveLength(1);
    expect(built.structures[0].name).toBe('Tower 1');
    expect(built.structures[0].children).toHaveLength(2);
    expect(countProjectUnits(built.structures)).toBe(3);
    expect(getStructureLeaves(built.structures)).toHaveLength(3);
    expect(built.floorProvisions).toHaveLength(3);
    expect(built.unitTypes.sort()).toEqual(['1BHK', '2BHK', '3BHK']);
    expect(built.floorProvisions.find((p) => p.floor === 0)?.unitConfigs[0])
      .toMatchObject({
        unitNo: 1,
        type: '1BHK',
        carpet_area: 450,
        parking_slots_included: 1
      });
  });
});

describe('parseProjectExcelWorkbook', () => {
  it('round-trips the downloadable template', () => {
    const wb = buildProjectExcelTemplateWorkbook();
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = parseProjectExcelWorkbook(buf);

    expect(result.unitCount).toBe(4);
    expect(result.draftPatch.name).toBe('Sunrise Residency');
    expect(result.draftPatch.location).toContain('Andheri');
    expect(result.draftPatch.unitTypesCsv).toContain('1BHK');
    expect(result.draftPatch.structures).toBeDefined();
    expect(countProjectUnits(result.draftPatch.structures!)).toBe(4);
    expect(result.draftPatch.floorProvisions?.length).toBeGreaterThan(0);
  });

  it('requires Units sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['name'], ['Only project']]),
      PROJECT_EXCEL_PROJECT_SHEET
    );
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    expect(() => parseProjectExcelWorkbook(buf)).toThrow(/Units/);
  });

  it('skips incomplete unit rows with warnings', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['name', 'location', 'base_rate', 'unit_types'],
        ['Test', 'Pune', 9000, '2BHK']
      ]),
      PROJECT_EXCEL_PROJECT_SHEET
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['building', 'wing', 'floor', 'unit_no', 'unit_type'],
        ['B1', 'A', 1, 1, '2BHK'],
        ['B1', 'A', 1, '', '2BHK']
      ]),
      PROJECT_EXCEL_UNITS_SHEET
    );
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = parseProjectExcelWorkbook(buf);
    expect(result.unitCount).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
