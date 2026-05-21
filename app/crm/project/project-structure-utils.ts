/** Inventory structure tree + floor provisioning (aligned with legacy POS wizard). */

export const STRUCTURE_KINDS = [
  'building',
  'tower',
  'wing',
  'block',
  'phase'
] as const;

export const DEFAULT_UNIT_TYPES = [
  '1RK',
  '1BHK',
  '1.5BHK',
  '2BHK',
  '2.5BHK',
  '3BHK',
  '3.5BHK',
  '4BHK',
  '5BHK',
  'Studio',
  'Duplex',
  'Penthouse',
  'Shop',
  'Office'
];

export type StructureNode = {
  id: string;
  name: string;
  kind: string;
  area: number;
  floorsPerStructure: number;
  unitsPerFloor: number;
  parkingCount: number;
  /** ₹ per parking slot (leaf-level; total value = count × rate). */
  parkingRate: number;
  children: StructureNode[];
};

export type StructureLeafRow = {
  path: StructureNode[];
  leaf: StructureNode;
  floorsPerStructure: number;
  unitsPerFloor: number;
};

export type UnitConfigDraft = {
  unitNo: number;
  name?: string;
  type?: string;
  /** Legacy / primary saleable sq.ft when carpet & BUA are unset */
  area: number;
  rate: number;
  carpet_area?: number;
  bua_area?: number;
  rera_area?: number;
  terrace_sqft?: number;
  deck_sqft?: number;
  loading_sqft?: number;
  /** ₹ lump floor-rise for this unit */
  floor_rise_charge?: number;
  /** ₹ lump PLC */
  plc_charge?: number;
  /** Covered slots bundled with the unit */
  parking_slots_included?: number;
};

export type FloorProvisionDraft = {
  structureLeafId: string;
  structurePath: string;
  structureName: string;
  floor: number;
  unitsPerFloor: number;
  unitType?: string;
  area?: number;
  rate?: number;
  unitConfigs: UnitConfigDraft[];
};

export function newStructureId(): string {
  return `ST-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

export function normalizeStructures(
  structures: StructureNode[] | undefined | null
): StructureNode[] {
  return Array.isArray(structures) ? structures : [];
}

export function structurePathDisplay(path: StructureNode[]): string {
  return path.map((n) => n.name).join(' › ');
}

export function getStructureLeaves(
  nodes: StructureNode[],
  pathPrefix: StructureNode[] = []
): StructureLeafRow[] {
  const out: StructureLeafRow[] = [];
  for (const node of nodes) {
    const path = [...pathPrefix, node];
    if (node.children?.length) {
      out.push(...getStructureLeaves(node.children, path));
    } else {
      out.push({
        path,
        leaf: node,
        floorsPerStructure: Math.max(
          1,
          Number(node.floorsPerStructure) || 1
        ),
        unitsPerFloor: Math.max(1, Number(node.unitsPerFloor) || 1)
      });
    }
  }
  return out;
}

export function projectParkingTotal(
  structures: StructureNode[] | undefined | null
): number {
  const leaves = getStructureLeaves(normalizeStructures(structures));
  let hasLeafParking = false;
  const leafTotal = leaves.reduce((sum, L) => {
    const p = L.leaf.parkingCount;
    if (p != null) {
      hasLeafParking = true;
      return sum + Math.max(0, Number(p) || 0);
    }
    return sum;
  }, 0);
  if (hasLeafParking) return leafTotal;
  return 0;
}

/** Sum of (parking slots × rate) across structure leaves. */
export function projectParkingValueTotal(
  structures: StructureNode[] | undefined | null
): number {
  const leaves = getStructureLeaves(normalizeStructures(structures));
  let hasLeafParking = false;
  const total = leaves.reduce((sum, L) => {
    const p = L.leaf.parkingCount;
    if (p != null) {
      hasLeafParking = true;
      const count = Math.max(0, Number(p) || 0);
      const rate = Math.max(0, Number(L.leaf.parkingRate) || 0);
      return sum + count * rate;
    }
    return sum;
  }, 0);
  if (!hasLeafParking) return 0;
  return total;
}

/** Weighted average ₹ per slot when total slots are greater than zero. */
export function projectParkingAvgRatePerSlot(
  structures: StructureNode[] | undefined | null
): number | null {
  const slots = projectParkingTotal(structures);
  if (slots <= 0) return null;
  const value = projectParkingValueTotal(structures);
  return value / slots;
}

export function totalStructureLeafArea(
  structures: StructureNode[] | undefined | null
): number {
  return getStructureLeaves(normalizeStructures(structures)).reduce(
    (sum, L) => sum + Math.max(0, Number(L.leaf.area) || 0),
    0
  );
}

/** Total residential units: each leaf contributes (floors+1) × units/floor (floors 0..N inclusive). */
export function countProjectUnits(structures: StructureNode[] | undefined | null): number {
  let total = 0;
  for (const L of getStructureLeaves(normalizeStructures(structures))) {
    const floors = L.floorsPerStructure;
    const per = L.unitsPerFloor;
    total += (floors + 1) * per;
  }
  return total;
}

export function deriveLegacyWingsFromStructures(
  structures: StructureNode[] | undefined | null
): string[] {
  const leaves = getStructureLeaves(normalizeStructures(structures));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const L of leaves) {
    const label = structurePathDisplay(L.path);
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export function computeAreaPerUnitFromInventory(
  structureLeafId: string,
  unitsPerFloor: number,
  leaves: StructureLeafRow[]
): number {
  const units = Math.max(1, Number(unitsPerFloor) || 1);
  const leaf = leaves.find((L) => L.leaf.id === structureLeafId);
  const floorArea = leaf ? Math.max(0, Number(leaf.leaf.area) || 0) : 0;
  if (floorArea <= 0) return 750;
  return Math.max(1, Math.round(floorArea / units));
}

export function buildUnitConfigs(
  structureLeafId: string,
  unitsPerFloor: number,
  prevConfigs: UnitConfigDraft[] | undefined,
  defaultRate: number,
  leaves: StructureLeafRow[],
  defaultUnitType?: string
): UnitConfigDraft[] {
  const fallbackType = (defaultUnitType || '').trim();
  const count = Math.max(1, Number(unitsPerFloor) || 1);
  const baseArea = computeAreaPerUnitFromInventory(
    structureLeafId,
    count,
    leaves
  );
  const baseRate = Math.max(1, Number(defaultRate) || 10000);
  const prev = Array.isArray(prevConfigs) ? prevConfigs : [];
  const next: UnitConfigDraft[] = [];
  for (let i = 1; i <= count; i++) {
    const old = prev.find((x) => Number(x.unitNo) === i);
    next.push({
      unitNo: i,
      name: typeof old?.name === 'string' ? old.name : '',
      type: (old?.type || '').trim() || fallbackType,
      area: Math.max(1, Number(old?.area) || baseArea),
      rate: Math.max(1, Number(old?.rate) || baseRate),
      ...(old
        ? {
            carpet_area: old.carpet_area,
            bua_area: old.bua_area,
            rera_area: old.rera_area,
            terrace_sqft: old.terrace_sqft,
            deck_sqft: old.deck_sqft,
            loading_sqft: old.loading_sqft,
            floor_rise_charge: old.floor_rise_charge,
            plc_charge: old.plc_charge,
            parking_slots_included: old.parking_slots_included
          }
        : {})
    });
  }
  return next;
}

export function buildDefaultFloorProvisions(params: {
  structures: StructureNode[];
  floorsPerWingDefault: number;
  unitsPerFloorDefault: number;
  baseRate: number;
  /** First unit type from step 2 (comma-separated list). */
  defaultUnitType?: string;
}): FloorProvisionDraft[] {
  const defaultUnitType = (params.defaultUnitType || '').trim();
  const structures = normalizeStructures(params.structures);
  const leaves = getStructureLeaves(structures);
  const defaults: FloorProvisionDraft[] = [];
  for (const L of leaves) {
    const floors = Math.max(1, Number(L.floorsPerStructure) || 1);
    const leafId = L.leaf?.id || '';
    const leafName = L.leaf?.name || '';
    const pathLabel = structurePathDisplay(L.path);
    const defaultUnits = Math.max(
      1,
      Number(L.unitsPerFloor) || Number(params.unitsPerFloorDefault) || 1
    );
    const rate = Math.max(1, Number(params.baseRate) || 10000);
    for (let floor = floors; floor >= 0; floor--) {
      defaults.push({
        structureLeafId: leafId,
        structurePath: pathLabel,
        structureName: leafName,
        floor,
        unitsPerFloor: defaultUnits,
        unitType: '',
        area: computeAreaPerUnitFromInventory(
          leafId,
          defaultUnits,
          leaves
        ),
        unitConfigs: buildUnitConfigs(
          leafId,
          defaultUnits,
          [],
          rate,
          leaves,
          defaultUnitType
        ),
        rate
      });
    }
  }
  return defaults;
}

export function defaultRootStructures(
  floorsPerWing: number,
  unitsPerFloor: number
): StructureNode[] {
  return ['A', 'B', 'C'].map((name) => ({
    id: newStructureId(),
    name,
    kind: 'wing',
    area: 0,
    floorsPerStructure: floorsPerWing,
    unitsPerFloor,
    parkingCount: 0,
    parkingRate: 0,
    children: []
  }));
}
