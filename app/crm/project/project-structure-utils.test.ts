import { describe, expect, it } from 'vitest';
import {
  buildUnitConfigs,
  computeAreaPerUnitFromInventory,
  countProjectUnits,
  deriveLegacyWingsFromStructures,
  getStructureLeaves,
  normalizeStructures,
  projectParkingTotal,
  projectParkingValueTotal,
  structurePathDisplay,
  type StructureNode
} from './project-structure-utils';

function leafNode(overrides: Partial<StructureNode> = {}): StructureNode {
  return {
    id: 'leaf-1',
    name: 'Wing A',
    kind: 'wing',
    area: 3000,
    floorsPerStructure: 2,
    unitsPerFloor: 2,
    parkingCount: 4,
    parkingRate: 500000,
    children: [],
    ...overrides
  };
}

describe('normalizeStructures', () => {
  it('returns empty array for nullish input', () => {
    expect(normalizeStructures(null)).toEqual([]);
  });
});

describe('structurePathDisplay', () => {
  it('joins node names with separator', () => {
    const path = [
      { ...leafNode(), name: 'Tower 1' },
      { ...leafNode(), name: 'Wing A' }
    ];
    expect(structurePathDisplay(path)).toBe('Tower 1 › Wing A');
  });
});

describe('getStructureLeaves', () => {
  it('returns leaf rows for nested structures', () => {
    const structures: StructureNode[] = [
      {
        id: 'root',
        name: 'Phase 1',
        kind: 'phase',
        area: 0,
        floorsPerStructure: 1,
        unitsPerFloor: 1,
        parkingCount: 0,
        parkingRate: 0,
        children: [leafNode()]
      }
    ];
    const leaves = getStructureLeaves(structures);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.leaf.name).toBe('Wing A');
  });
});

describe('countProjectUnits', () => {
  it('counts units across floors inclusive of ground', () => {
    const structures = [leafNode({ floorsPerStructure: 2, unitsPerFloor: 2 })];
    expect(countProjectUnits(structures)).toBe((2 + 1) * 2);
  });
});

describe('projectParkingTotal', () => {
  it('sums parking slots on leaves', () => {
    expect(projectParkingTotal([leafNode({ parkingCount: 4 })])).toBe(4);
  });
});

describe('projectParkingValueTotal', () => {
  it('sums slot count times rate', () => {
    expect(
      projectParkingValueTotal([
        leafNode({ parkingCount: 2, parkingRate: 100000 })
      ])
    ).toBe(200000);
  });
});

describe('deriveLegacyWingsFromStructures', () => {
  it('returns unique path labels', () => {
    const structures = [leafNode({ name: 'A' }), leafNode({ id: 'leaf-2', name: 'B' })];
    expect(deriveLegacyWingsFromStructures(structures)).toEqual(['A', 'B']);
  });
});

describe('computeAreaPerUnitFromInventory', () => {
  it('divides leaf area by units per floor', () => {
    const leaves = getStructureLeaves([leafNode({ area: 1000, unitsPerFloor: 4 })]);
    expect(computeAreaPerUnitFromInventory('leaf-1', 4, leaves)).toBe(250);
  });

  it('falls back to 750 when area is zero', () => {
    const leaves = getStructureLeaves([leafNode({ area: 0 })]);
    expect(computeAreaPerUnitFromInventory('leaf-1', 2, leaves)).toBe(750);
  });
});

describe('buildUnitConfigs', () => {
  it('creates one config per unit with defaults', () => {
    const leaves = getStructureLeaves([leafNode()]);
    const configs = buildUnitConfigs('leaf-1', 2, [], 12000, leaves, '2BHK');
    expect(configs).toHaveLength(2);
    expect(configs[0]?.type).toBe('2BHK');
    expect(configs[0]?.rate).toBe(12000);
  });
});
