/** Inventory structure tree + floor provisioning (Building → Wing → Floor → Unit). */

export const STRUCTURE_HIERARCHY = [
  'building',
  'wing',
  'floor',
  'unit'
] as const;

export type StructureHierarchyKind = (typeof STRUCTURE_HIERARCHY)[number];

/** @deprecated Use STRUCTURE_HIERARCHY — fixed four-level hierarchy. */
export const STRUCTURE_KINDS = STRUCTURE_HIERARCHY;

export function structureDepthKind(depth: number): StructureHierarchyKind {
  return STRUCTURE_HIERARCHY[
    Math.min(Math.max(0, depth), STRUCTURE_HIERARCHY.length - 1)
  ];
}

export function structureAddLabel(depth: number): string {
  const labels = ['Add Building', 'Add Wing', 'Add Floor', 'Add Unit'];
  return labels[Math.min(Math.max(0, depth), labels.length - 1)] ?? 'Add';
}

export function isStructureLeafKind(kind: string): boolean {
  return kind === 'unit';
}

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
  /** Set on floor nodes (0 = ground). */
  floorNumber?: number;
  parkingCount: number;
  /** ₹ per parking slot (unit-level; total value = count × rate). */
  parkingRate: number;
  children: StructureNode[];
};

export type StructureLeafRow = {
  path: StructureNode[];
  /** Floor node (Building → Wing → Floor). */
  leaf: StructureNode;
  floorNumber: number;
  unitsPerFloor: number;
  /** @deprecated Same as floorNumber — kept for older callers. */
  floorsPerStructure: number;
};

export type UnitConfigDraft = {
  unitNo: number;
  name?: string;
  type?: string;
  category?: string;
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

function unitChildrenOf(node: StructureNode): StructureNode[] {
  return (node.children || []).filter(
    (c) => c.kind === 'unit' || isStructureLeafKind(c.kind)
  );
}

function floorRowFromNode(
  path: StructureNode[],
  floorNode: StructureNode
): StructureLeafRow {
  const units = unitChildrenOf(floorNode);
  const unitsPerFloor = Math.max(
    1,
    Number(floorNode.unitsPerFloor) || units.length || 1
  );
  const floorNumber = Math.max(
    0,
    Number(floorNode.floorNumber) ||
      Number(floorNode.floorsPerStructure) ||
      0
  );
  return {
    path,
    leaf: floorNode,
    floorNumber,
    unitsPerFloor,
    floorsPerStructure: floorNumber
  };
}

/** Returns one row per floor node in the Building → Wing → Floor → Unit tree. */
export function getStructureLeaves(
  nodes: StructureNode[],
  pathPrefix: StructureNode[] = []
): StructureLeafRow[] {
  const out: StructureLeafRow[] = [];
  for (const node of nodes) {
    const path = [...pathPrefix, node];
    if (node.kind === 'floor') {
      out.push(floorRowFromNode(path, node));
      continue;
    }
    if (node.children?.length) {
      out.push(...getStructureLeaves(node.children, path));
    }
  }
  return out;
}

export function countStructureUnits(nodes: StructureNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.kind === 'unit') {
      total += 1;
    } else if (node.children?.length) {
      total += countStructureUnits(node.children);
    }
  }
  return total;
}

export function projectParkingTotal(
  structures: StructureNode[] | undefined | null
): number {
  let total = 0;
  let hasUnitParking = false;
  function walk(nodes: StructureNode[]) {
    for (const node of nodes) {
      if (node.kind === 'unit') {
        if (node.parkingCount != null) {
          hasUnitParking = true;
          total += Math.max(0, Number(node.parkingCount) || 0);
        }
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(normalizeStructures(structures));
  if (hasUnitParking) return total;
  return 0;
}

/** Sum of (parking slots × rate) across structure leaves. */
export function projectParkingValueTotal(
  structures: StructureNode[] | undefined | null
): number {
  let total = 0;
  let hasUnitParking = false;
  function walk(nodes: StructureNode[]) {
    for (const node of nodes) {
      if (node.kind === 'unit') {
        if (node.parkingCount != null) {
          hasUnitParking = true;
          const count = Math.max(0, Number(node.parkingCount) || 0);
          const rate = Math.max(0, Number(node.parkingRate) || 0);
          total += count * rate;
        }
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(normalizeStructures(structures));
  if (!hasUnitParking) return 0;
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
  let total = 0;
  function walk(nodes: StructureNode[]) {
    for (const node of nodes) {
      if (node.kind === 'unit') {
        total += Math.max(0, Number(node.area) || 0);
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(normalizeStructures(structures));
  return total;
}

/** Total residential units across all floor nodes. */
export function countProjectUnits(
  structures: StructureNode[] | undefined | null
): number {
  const normalized = normalizeStructures(structures);
  const fromUnits = countStructureUnits(normalized);
  if (fromUnits > 0) return fromUnits;
  return getStructureLeaves(normalized).reduce(
    (sum, L) => sum + L.unitsPerFloor,
    0
  );
}

export function deriveLegacyWingsFromStructures(
  structures: StructureNode[] | undefined | null
): string[] {
  const leaves = getStructureLeaves(normalizeStructures(structures));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const L of leaves) {
    const wingPath = L.path.slice(0, -1);
    const label = structurePathDisplay(wingPath);
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
  const floorRow = leaves.find((L) => L.leaf.id === structureLeafId);
  if (!floorRow) return 750;
  const unitNodes = unitChildrenOf(floorRow.leaf);
  if (unitNodes.length) {
    const sum = unitNodes.reduce(
      (s, u) => s + Math.max(0, Number(u.area) || 0),
      0
    );
    if (sum > 0) return Math.max(1, Math.round(sum / unitNodes.length));
  }
  const floorArea = Math.max(0, Number(floorRow.leaf.area) || 0);
  if (floorArea <= 0) return 750;
  return Math.max(1, Math.round(floorArea / units));
}

export function buildUnitConfigs(
  structureLeafId: string,
  unitsPerFloor: number,
  prevConfigs: UnitConfigDraft[] | undefined,
  defaultRate: number,
  leaves: StructureLeafRow[],
  defaultUnitType?: string,
  defaultUnitCategory?: string
): UnitConfigDraft[] {
  const fallbackType = (defaultUnitType || '').trim();
  const fallbackCategory = (defaultUnitCategory || '').trim();
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
      category: (old?.category || '').trim() || fallbackCategory || undefined,
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

/** Sum bundled parking slots from floor provision unit rows. */
export function floorProvisionsParkingTotal(
  provisions: FloorProvisionDraft[] | undefined | null
): number {
  let total = 0;
  for (const row of provisions || []) {
    for (const u of row.unitConfigs || []) {
      total += Math.max(0, Number(u.parking_slots_included) || 0);
    }
  }
  return total;
}

export function buildDefaultFloorProvisions(params: {
  structures: StructureNode[];
  floorsPerWingDefault: number;
  unitsPerFloorDefault: number;
  baseRate: number;
  /** First unit type from step 2 (comma-separated list). */
  defaultUnitType?: string;
  /** First unit category from step 2 (comma-separated list). */
  defaultUnitCategory?: string;
}): FloorProvisionDraft[] {
  const defaultUnitType = (params.defaultUnitType || '').trim();
  const defaultUnitCategory = (params.defaultUnitCategory || '').trim();
  const structures = normalizeStructures(params.structures);
  const leaves = getStructureLeaves(structures);
  const defaults: FloorProvisionDraft[] = [];
  for (const L of leaves) {
    const floorNum = L.floorNumber;
    const leafId = L.leaf?.id || '';
    const wingPath = L.path.slice(0, -1);
    const pathLabel = structurePathDisplay(wingPath);
    const wingName =
      wingPath[wingPath.length - 1]?.name || L.leaf?.name || '';
    const defaultUnits = Math.max(1, Number(L.unitsPerFloor) || 1);
    const rate = Math.max(1, Number(params.baseRate) || 10000);
    const unitNodes = unitChildrenOf(L.leaf);
    const prevConfigs: UnitConfigDraft[] = unitNodes.map((u, idx) => ({
      unitNo: idx + 1,
      name: u.name || '',
      type: '',
      area: Math.max(1, Number(u.area) || 750),
      rate,
      parking_slots_included:
        u.parkingCount != null && u.parkingCount > 0
          ? u.parkingCount
          : undefined
    }));
    defaults.push({
      structureLeafId: leafId,
      structurePath: pathLabel,
      structureName: wingName,
      floor: floorNum,
      unitsPerFloor: defaultUnits,
      unitType: '',
      area: computeAreaPerUnitFromInventory(leafId, defaultUnits, leaves),
      unitConfigs: buildUnitConfigs(
        leafId,
        defaultUnits,
        prevConfigs.length ? prevConfigs : [],
        rate,
        leaves,
        defaultUnitType,
        defaultUnitCategory
      ),
      rate
    });
  }
  return defaults;
}

function newStructureNodeBase(
  kind: StructureHierarchyKind,
  name: string,
  overrides: Partial<StructureNode> = {}
): StructureNode {
  return {
    id: newStructureId(),
    name,
    kind,
    area: 0,
    floorsPerStructure: 1,
    unitsPerFloor: 1,
    parkingCount: 0,
    parkingRate: 0,
    children: [],
    ...overrides
  };
}

export function newBuildingNode(index: number): StructureNode {
  return newStructureNodeBase('building', `Building ${index}`);
}

export function newWingNode(index: number): StructureNode {
  const label = String.fromCharCode(64 + Math.max(1, index));
  return newStructureNodeBase('wing', `Wing ${label}`);
}

export function newFloorNode(
  floorNumber: number,
  unitsPerFloorDefault: number
): StructureNode {
  const label =
    floorNumber === 0 ? 'Ground Floor' : `Floor ${floorNumber}`;
  return newStructureNodeBase('floor', label, {
    floorNumber,
    floorsPerStructure: floorNumber,
    unitsPerFloor: Math.max(1, unitsPerFloorDefault),
    children: []
  });
}

export function newUnitNode(index: number): StructureNode {
  return newStructureNodeBase('unit', `Unit ${index}`, {
    area: 750,
    unitsPerFloor: 1,
    floorsPerStructure: 0
  });
}

export function defaultRootStructures(
  _floorsPerWing: number,
  unitsPerFloor: number
): StructureNode[] {
  return [
    {
      ...newBuildingNode(1),
      children: ['A', 'B', 'C'].map((name) => ({
        ...newStructureNodeBase('wing', `Wing ${name}`, {
          unitsPerFloor,
          floorsPerStructure: _floorsPerWing
        }),
        children: [newFloorNode(0, unitsPerFloor)]
      }))
    }
  ];
}
