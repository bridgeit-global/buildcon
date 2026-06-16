import { describe, expect, it } from 'vitest';
import {
  applyDefaultUnitTypeToFloorProvisions,
  createInitialDraft,
  createProjectStep0Schema,
  createProjectStep1FieldsSchema,
  createProjectStep3Schema,
  firstUnitTypeFromCsv,
  parseUnitTypesCsv,
  unitTypesFromDraft,
  validateCreateStep,
  validateFloorUnitTypesAssigned,
  type CreateProjectDraft
} from './project-create-shared';

describe('parseUnitTypesCsv', () => {
  it('parses and dedupes comma-separated types', () => {
    expect(parseUnitTypesCsv('1BHK, 2BHK, 1BHK')).toEqual(['1BHK', '2BHK']);
  });

  it('returns empty for blank csv', () => {
    expect(parseUnitTypesCsv(' , ')).toEqual([]);
  });
});

describe('firstUnitTypeFromCsv', () => {
  it('returns first parsed type', () => {
    expect(firstUnitTypeFromCsv('2BHK, 3BHK')).toBe('2BHK');
  });
});

describe('createProjectStep0Schema', () => {
  it('accepts name and location', () => {
    expect(
      createProjectStep0Schema.safeParse({
        name: 'Sunrise',
        location: 'Mumbai'
      }).success
    ).toBe(true);
  });

  it('rejects empty location', () => {
    expect(
      createProjectStep0Schema.safeParse({
        name: 'Sunrise',
        location: ''
      }).success
    ).toBe(false);
  });
});

describe('createProjectStep1FieldsSchema', () => {
  it('accepts csv with at least one unit type', () => {
    expect(
      createProjectStep1FieldsSchema.safeParse({ unitTypesCsv: '1BHK' }).success
    ).toBe(true);
  });

  it('rejects empty unit types csv', () => {
    expect(
      createProjectStep1FieldsSchema.safeParse({ unitTypesCsv: '' }).success
    ).toBe(false);
  });
});

describe('createProjectStep3Schema', () => {
  it('accepts non-negative rates', () => {
    expect(
      createProjectStep3Schema.safeParse({
        base_rate: 10000,
        min_rate: 9000,
        max_rate: 12000
      }).success
    ).toBe(true);
  });

  it('rejects negative rates', () => {
    expect(
      createProjectStep3Schema.safeParse({
        base_rate: -1,
        min_rate: 0,
        max_rate: 0
      }).success
    ).toBe(false);
  });
});

describe('applyDefaultUnitTypeToFloorProvisions', () => {
  it('fills empty unit types', () => {
    const next = applyDefaultUnitTypeToFloorProvisions(
      [
        {
          structureLeafId: 'leaf-1',
          structurePath: 'A',
          structureName: 'A',
          floor: 1,
          unitsPerFloor: 1,
          unitConfigs: [{ unitNo: 1, area: 750, rate: 10000, type: '' }]
        }
      ],
      '2BHK'
    );
    expect(next[0]?.unitConfigs[0]?.type).toBe('2BHK');
  });
});

describe('validateFloorUnitTypesAssigned', () => {
  it('returns error when a unit type is missing', () => {
    const draft = createInitialDraft();
    draft.floorProvisions = [
      {
        structureLeafId: 'leaf-1',
        structurePath: 'A',
        structureName: 'A',
        floor: 0,
        unitsPerFloor: 1,
        unitConfigs: [{ unitNo: 1, area: 750, rate: 10000, type: '' }]
      }
    ];
    expect(validateFloorUnitTypesAssigned(draft)).toMatch(/unit type/i);
  });
});

describe('validateCreateStep', () => {
  it('validates step 0 name and location', () => {
    const draft = createInitialDraft();
    draft.name = '';
    expect(validateCreateStep(0, draft)).toMatch(/name/i);
  });

  it('validates step 1 unit types', () => {
    const draft = createInitialDraft();
    draft.unitTypesCsv = '';
    expect(validateCreateStep(1, draft)).toMatch(/unit type/i);
  });
});

describe('unitTypesFromDraft', () => {
  it('merges csv and floor provision types', () => {
    const draft: CreateProjectDraft = {
      ...createInitialDraft(),
      unitTypesCsv: '1BHK,2BHK',
      floorProvisions: [
        {
          structureLeafId: 'leaf-1',
          structurePath: 'A',
          structureName: 'A',
          floor: 0,
          unitsPerFloor: 1,
          unitConfigs: [{ unitNo: 1, area: 750, rate: 10000, type: '3BHK' }]
        }
      ]
    };
    expect(unitTypesFromDraft(draft)).toEqual(['1BHK', '2BHK', '3BHK']);
  });
});
