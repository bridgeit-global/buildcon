import { describe, expect, it } from 'vitest';
import {
  buildUnitConfigs,
  computeAreaPerUnitFromInventory,
  countProjectUnits,
  deriveLegacyWingsFromStructures,
  getStructureLeaves,
  newBuildingNode,
  newFloorNode,
  newUnitNode,
  newWingNode,
  normalizeStructures,
  projectParkingTotal,
  projectParkingValueTotal,
  structurePathDisplay,
  type StructureNode
} from './project-structure-utils';

function sampleHierarchy(): StructureNode[] {
  const unit1 = newUnitNode(1);
  unit1.id = 'unit-1';
  unit1.area = 800;
  unit1.parkingCount = 2;
  unit1.parkingRate = 100000;

  const unit2 = newUnitNode(2);
  unit2.id = 'unit-2';
  unit2.area = 900;

  const floor = newFloorNode(1, 2);
  floor.id = 'floor-1';
  floor.children = [unit1, unit2];

  const wing = newWingNode(1);
  wing.id = 'wing-1';
  wing.children = [floor];

  const building = newBuildingNode(1);
  building.id = 'building-1';
  building.children = [wing];

  return [building];
}

describe('normalizeStructures', () => {
  it('returns empty array for nullish input', () => {
    expect(normalizeStructures(null)).toEqual([]);
  });
});

describe('structurePathDisplay', () => {
  it('joins node names with separator', () => {
    const path = [
      { ...newBuildingNode(1), name: 'Building 1' },
      { ...newWingNode(1), name: 'Wing A' }
    ];
    expect(structurePathDisplay(path)).toBe('Building 1 › Wing A');
  });
});

describe('getStructureLeaves', () => {
  it('returns floor rows for Building → Wing → Floor → Unit tree', () => {
    const leaves = getStructureLeaves(sampleHierarchy());
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.leaf.id).toBe('floor-1');
    expect(leaves[0]?.floorNumber).toBe(1);
    expect(leaves[0]?.unitsPerFloor).toBe(2);
  });
});

describe('countProjectUnits', () => {
  it('counts unit nodes in the hierarchy', () => {
    expect(countProjectUnits(sampleHierarchy())).toBe(2);
  });
});

describe('projectParkingTotal', () => {
  it('sums parking slots on unit nodes', () => {
    expect(projectParkingTotal(sampleHierarchy())).toBe(2);
  });
});

describe('projectParkingValueTotal', () => {
  it('sums slot count times rate on units', () => {
    expect(projectParkingValueTotal(sampleHierarchy())).toBe(200000);
  });
});

describe('deriveLegacyWingsFromStructures', () => {
  it('returns unique wing path labels without floor', () => {
    expect(deriveLegacyWingsFromStructures(sampleHierarchy())).toEqual([
      'Building 1 › Wing A'
    ]);
  });
});

describe('computeAreaPerUnitFromInventory', () => {
  it('averages unit areas on a floor', () => {
    const leaves = getStructureLeaves(sampleHierarchy());
    expect(computeAreaPerUnitFromInventory('floor-1', 2, leaves)).toBe(850);
  });

  it('falls back to 750 when area is zero', () => {
    const structures = sampleHierarchy();
    structures[0]!.children![0]!.children![0]!.children = [
      newUnitNode(1)
    ];
    const leaves = getStructureLeaves(structures);
    expect(computeAreaPerUnitFromInventory('floor-1', 1, leaves)).toBe(750);
  });
});

describe('buildUnitConfigs', () => {
  it('creates one config per unit with defaults', () => {
    const leaves = getStructureLeaves(sampleHierarchy());
    const configs = buildUnitConfigs('floor-1', 2, [], 12000, leaves, '2BHK');
    expect(configs).toHaveLength(2);
    expect(configs[0]?.type).toBe('2BHK');
    expect(configs[0]?.rate).toBe(12000);
  });
});
