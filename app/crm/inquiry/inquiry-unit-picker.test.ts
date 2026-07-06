import { describe, expect, it } from 'vitest';
import type { InquiryProjectPickOption } from './inquiry-unit-picker';
import { unitPickFiltersFromSellerPreferences } from './inquiry-unit-picker';
import type { UnitRow } from './inquiry-types';

function unit(
  overrides: Partial<UnitRow> & Pick<UnitRow, 'id' | 'project_id'>
): UnitRow {
  return {
    project_name: 'Project',
    unit_code: '101',
    wing_name: 'A',
    floor: 5,
    unit_no: 101,
    unit_type: '2 BHK',
    area: 900,
    carpet_area: 800,
    bua_area: null,
    rate: 12000,
    floor_rise_charge: 0,
    plc_charge: 0,
    status: 'AVAILABLE',
    ...overrides
  };
}

const projects: InquiryProjectPickOption[] = [
  { id: 'p-alpha', name: 'Alpha Residency', location: 'Andheri West' },
  { id: 'p-beta', name: 'Beta Heights', location: 'Bandra East' }
];

describe('unitPickFiltersFromSellerPreferences', () => {
  it('selects a project that has units matching unit type preference', () => {
    const units = [
      unit({ id: 'u1', project_id: 'p-alpha', unit_type: '1 BHK' }),
      unit({ id: 'u2', project_id: 'p-beta', unit_type: '2 BHK' })
    ];

    const filters = unitPickFiltersFromSellerPreferences(
      units,
      { interestedIn: '2 BHK' },
      projects
    );

    expect(filters.projectId).toBe('p-beta');
    expect(filters.unitType).toBe('2 BHK');
  });

  it('prefers location-matched project when it also has matching units', () => {
    const units = [
      unit({
        id: 'u1',
        project_id: 'p-alpha',
        project_name: 'Alpha Residency',
        unit_type: '2 BHK'
      }),
      unit({
        id: 'u2',
        project_id: 'p-beta',
        project_name: 'Beta Heights',
        unit_type: '2 BHK'
      })
    ];

    const filters = unitPickFiltersFromSellerPreferences(
      units,
      { interestedIn: '2 BHK', preferredLocation: 'Andheri' },
      projects
    );

    expect(filters.projectId).toBe('p-alpha');
  });

  it('defaults to the first accessible project when no units match preferences', () => {
    const units = [
      unit({ id: 'u1', project_id: 'p-alpha', unit_type: '1 BHK' }),
      unit({ id: 'u2', project_id: 'p-beta', unit_type: '1 BHK' })
    ];

    const filters = unitPickFiltersFromSellerPreferences(
      units,
      { interestedIn: '4 BHK' },
      projects
    );

    expect(filters.projectId).toBe('p-alpha');
    expect(filters.search).toBe('4 BHK');
  });

  it('always selects a default project when preferences are empty', () => {
    const units = [
      unit({ id: 'u1', project_id: 'p-beta', unit_type: '1 BHK' }),
      unit({ id: 'u2', project_id: 'p-alpha', unit_type: '2 BHK' })
    ];

    const filters = unitPickFiltersFromSellerPreferences(units, {}, projects);

    expect(filters.projectId).toBe('p-alpha');
  });

  it('defaults to the only project when a single accessible project exists', () => {
    const units = [
      unit({ id: 'u1', project_id: 'p-alpha', unit_type: '1 BHK' })
    ];

    const filters = unitPickFiltersFromSellerPreferences(
      units,
      { interestedIn: '4 BHK' },
      [{ id: 'p-alpha', name: 'Alpha Residency' }]
    );

    expect(filters.projectId).toBe('p-alpha');
  });
});
