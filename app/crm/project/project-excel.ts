import * as XLSX from 'xlsx';
import {
  coerceProjectFy,
  PROJECT_TYPES,
  type ProjectType
} from '@/lib/project/project-fy';
import type { CreateProjectDraft } from './project-create-shared';
import {
  newBuildingNode,
  newStructureId,
  newUnitNode,
  type FloorProvisionDraft,
  type StructureNode,
  type UnitConfigDraft
} from './project-structure-utils';

export const PROJECT_EXCEL_PROJECT_SHEET = 'Project';
export const PROJECT_EXCEL_UNITS_SHEET = 'Units';
export const PROJECT_EXCEL_INSTRUCTIONS_SHEET = 'Instructions';

export const PROJECT_EXCEL_UNIT_HEADERS = [
  'building',
  'wing',
  'floor',
  'unit_no',
  'unit_name',
  'unit_type',
  'unit_category',
  'carpet_area',
  'bua_area',
  'rera_area',
  'terrace_sqft',
  'deck_sqft',
  'loading_sqft',
  'rate',
  'floor_rise_charge',
  'plc_charge',
  'parking_slots'
] as const;

export const PROJECT_EXCEL_PROJECT_HEADERS = [
  'name',
  'location',
  'type',
  'status',
  'fy',
  'rera_no',
  'base_rate',
  'unit_types',
  'unit_categories'
] as const;

const PROJECT_STATUSES = ['Active', 'Planning', 'On Hold'] as const;

export type ProjectExcelUnitRow = {
  building: string;
  wing: string;
  floor: number;
  unit_no: number;
  unit_name: string;
  unit_type: string;
  unit_category: string;
  carpet_area?: number;
  bua_area?: number;
  rera_area?: number;
  terrace_sqft?: number;
  deck_sqft?: number;
  loading_sqft?: number;
  rate?: number;
  floor_rise_charge?: number;
  plc_charge?: number;
  parking_slots?: number;
};

export type ProjectExcelParseResult = {
  draftPatch: Partial<CreateProjectDraft>;
  unitCount: number;
  warnings: string[];
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function cellNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function normalizeHeader(h: unknown): string {
  return cellStr(h)
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/_+/g, '_');
}

function headerIndexMap(headers: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key) map.set(key, i);
  });
  return map;
}

function rowValue(
  row: unknown[],
  map: Map<string, number>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const idx = map.get(key);
    if (idx != null && row[idx] != null && cellStr(row[idx]) !== '') {
      return row[idx];
    }
  }
  return undefined;
}

/** Parse floor: 0 / GF / Ground → 0; Floor 2 → 2; numeric strings as-is. */
export function parseFloorValue(raw: unknown): number | null {
  const s = cellStr(raw);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (
    lower === '0' ||
    lower === 'gf' ||
    lower === 'g' ||
    lower === 'ground' ||
    lower === 'ground floor' ||
    lower === 'gr'
  ) {
    return 0;
  }
  const floored = lower.match(/^floor\s*(\d+)$/);
  if (floored) return Number(floored[1]);
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function floorLabel(floor: number): string {
  return floor === 0 ? 'Ground Floor' : `Floor ${floor}`;
}

function newWingNamed(name: string): StructureNode {
  return {
    id: newStructureId(),
    name,
    kind: 'wing',
    area: 0,
    floorsPerStructure: 1,
    unitsPerFloor: 1,
    parkingCount: 0,
    parkingRate: 0,
    children: []
  };
}

function newFloorNamed(
  floorNumber: number,
  units: StructureNode[]
): StructureNode {
  return {
    id: newStructureId(),
    name: floorLabel(floorNumber),
    kind: 'floor',
    area: 0,
    floorNumber,
    floorsPerStructure: floorNumber,
    unitsPerFloor: Math.max(1, units.length),
    parkingCount: 0,
    parkingRate: 0,
    children: units
  };
}

function unitAreaFromRow(row: ProjectExcelUnitRow): number {
  const fromAreas =
    row.carpet_area ?? row.bua_area ?? row.rera_area ?? undefined;
  if (fromAreas != null && fromAreas > 0) return Math.max(1, fromAreas);
  return 750;
}

function toUnitConfig(
  row: ProjectExcelUnitRow,
  defaultRate: number
): UnitConfigDraft {
  const area = unitAreaFromRow(row);
  const rate = Math.max(1, row.rate ?? defaultRate);
  return {
    unitNo: row.unit_no,
    name: row.unit_name || '',
    type: row.unit_type || '',
    category: row.unit_category || undefined,
    area,
    rate,
    carpet_area: row.carpet_area,
    bua_area: row.bua_area,
    rera_area: row.rera_area,
    terrace_sqft: row.terrace_sqft,
    deck_sqft: row.deck_sqft,
    loading_sqft: row.loading_sqft,
    floor_rise_charge: row.floor_rise_charge,
    plc_charge: row.plc_charge,
    parking_slots_included:
      row.parking_slots != null && row.parking_slots > 0
        ? row.parking_slots
        : undefined
  };
}

function toUnitNode(row: ProjectExcelUnitRow): StructureNode {
  const unit = newUnitNode(row.unit_no);
  unit.name = row.unit_name || `Unit ${row.unit_no}`;
  unit.area = unitAreaFromRow(row);
  if (row.parking_slots != null && row.parking_slots > 0) {
    unit.parkingCount = row.parking_slots;
  }
  return unit;
}

/** Build Building → Wing → Floor → Unit tree + floor provisions from flat unit rows. */
export function buildDraftFromUnitRows(
  rows: ProjectExcelUnitRow[],
  baseRate: number
): {
  structures: StructureNode[];
  floorProvisions: FloorProvisionDraft[];
  floors_per_wing: number;
  units_per_floor: number;
  unitTypes: string[];
  unitCategories: string[];
} {
  type FloorBucket = { floor: number; units: ProjectExcelUnitRow[] };
  type WingBucket = Map<number, FloorBucket>;
  type BuildingBucket = Map<string, WingBucket>;

  const byBuilding = new Map<string, BuildingBucket>();
  const typeSet = new Set<string>();
  const categorySet = new Set<string>();
  let maxFloor = 0;
  let maxUnitsOnFloor = 1;

  for (const row of rows) {
    if (row.unit_type) typeSet.add(row.unit_type);
    if (row.unit_category) categorySet.add(row.unit_category);
    maxFloor = Math.max(maxFloor, row.floor);

    let wings = byBuilding.get(row.building);
    if (!wings) {
      wings = new Map();
      byBuilding.set(row.building, wings);
    }
    let floors = wings.get(row.wing);
    if (!floors) {
      floors = new Map();
      wings.set(row.wing, floors);
    }
    let bucket = floors.get(row.floor);
    if (!bucket) {
      bucket = { floor: row.floor, units: [] };
      floors.set(row.floor, bucket);
    }
    bucket.units.push(row);
  }

  const structures: StructureNode[] = [];
  const floorProvisions: FloorProvisionDraft[] = [];
  let buildingIndex = 0;

  for (const [buildingName, wings] of byBuilding) {
    buildingIndex += 1;
    const building =
      buildingIndex === 1
        ? { ...newBuildingNode(1), name: buildingName, children: [] as StructureNode[] }
        : {
            ...newBuildingNode(buildingIndex),
            name: buildingName,
            children: [] as StructureNode[]
          };

    for (const [wingName, floors] of wings) {
      const wing = newWingNamed(wingName);
      const sortedFloors = [...floors.values()].sort((a, b) => a.floor - b.floor);

      for (const bucket of sortedFloors) {
        bucket.units.sort((a, b) => a.unit_no - b.unit_no);
        maxUnitsOnFloor = Math.max(maxUnitsOnFloor, bucket.units.length);

        const unitNodes = bucket.units.map(toUnitNode);
        const floorNode = newFloorNamed(bucket.floor, unitNodes);
        wing.children.push(floorNode);

        const pathLabel = `${buildingName} › ${wingName}`;
        const configs = bucket.units.map((u) => toUnitConfig(u, baseRate));
        const avgRate =
          configs.reduce((s, c) => s + c.rate, 0) / Math.max(1, configs.length);

        floorProvisions.push({
          structureLeafId: floorNode.id,
          structurePath: pathLabel,
          structureName: wingName,
          floor: bucket.floor,
          unitsPerFloor: configs.length,
          rate: Math.round(avgRate) || baseRate,
          area: configs[0]?.area,
          unitConfigs: configs
        });
      }

      wing.unitsPerFloor = maxUnitsOnFloor;
      wing.floorsPerStructure = Math.max(1, sortedFloors.length);
      building.children.push(wing);
    }

    structures.push(building);
  }

  return {
    structures,
    floorProvisions,
    floors_per_wing: Math.max(1, maxFloor || 1),
    units_per_floor: maxUnitsOnFloor,
    unitTypes: [...typeSet],
    unitCategories: [...categorySet]
  };
}

function parseProjectSheet(
  wb: XLSX.WorkBook,
  warnings: string[]
): Partial<CreateProjectDraft> {
  const sheet = wb.Sheets[PROJECT_EXCEL_PROJECT_SHEET];
  if (!sheet) {
    warnings.push(
      `Missing "${PROJECT_EXCEL_PROJECT_SHEET}" sheet — project fields left unchanged.`
    );
    return {};
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (!rows.length) return {};

  const map = headerIndexMap(rows[0] || []);
  const dataRow = rows[1];
  if (!dataRow) return {};

  const patch: Partial<CreateProjectDraft> = {};

  const name = cellStr(rowValue(dataRow, map, 'name', 'project_name'));
  if (name) patch.name = name;

  const location = cellStr(rowValue(dataRow, map, 'location'));
  if (location) patch.location = location;

  const typeRaw = cellStr(rowValue(dataRow, map, 'type', 'project_type'));
  if (typeRaw) {
    const matched = PROJECT_TYPES.find(
      (t) => t.toLowerCase() === typeRaw.toLowerCase()
    );
    if (matched) {
      patch.type = matched as ProjectType;
    } else {
      warnings.push(`Unknown project type "${typeRaw}" — kept existing type.`);
    }
  }

  const statusRaw = cellStr(rowValue(dataRow, map, 'status'));
  if (statusRaw) {
    const matched = PROJECT_STATUSES.find(
      (s) => s.toLowerCase() === statusRaw.toLowerCase()
    );
    if (matched) {
      patch.status = matched;
    } else {
      warnings.push(`Unknown status "${statusRaw}" — kept existing status.`);
    }
  }

  const fy = cellStr(rowValue(dataRow, map, 'fy', 'financial_year'));
  if (fy) patch.fy = fy;

  const rera = cellStr(rowValue(dataRow, map, 'rera_no', 'rera'));
  if (rera) patch.rera_no = rera;

  const baseRate = cellNum(rowValue(dataRow, map, 'base_rate'));
  if (baseRate != null && baseRate >= 0) patch.base_rate = baseRate;

  const unitTypes = cellStr(
    rowValue(dataRow, map, 'unit_types', 'unit_type')
  );
  if (unitTypes) patch.unitTypesCsv = unitTypes;

  const unitCategories = cellStr(
    rowValue(dataRow, map, 'unit_categories', 'unit_category')
  );
  if (unitCategories) patch.unitCategoriesCsv = unitCategories;

  if (patch.type && patch.fy) {
    patch.fy = coerceProjectFy(patch.type, patch.fy);
  } else if (patch.type) {
    patch.fy = coerceProjectFy(patch.type, patch.fy ?? '');
  }

  return patch;
}

function parseUnitsSheet(
  wb: XLSX.WorkBook,
  warnings: string[]
): ProjectExcelUnitRow[] {
  const sheet = wb.Sheets[PROJECT_EXCEL_UNITS_SHEET];
  if (!sheet) {
    throw new Error(
      `Missing "${PROJECT_EXCEL_UNITS_SHEET}" sheet. Download the template and fill unit rows.`
    );
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (rows.length < 2) {
    throw new Error('Units sheet has no data rows.');
  }

  const map = headerIndexMap(rows[0] || []);
  const required = ['building', 'wing', 'floor', 'unit_no'] as const;
  for (const key of required) {
    if (!map.has(key)) {
      throw new Error(
        `Units sheet is missing required column "${key}". Download the template to see the expected headers.`
      );
    }
  }

  const out: ProjectExcelUnitRow[] = [];
  const seenKeys = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => cellStr(c) === '')) continue;

    const building = cellStr(rowValue(row, map, 'building'));
    const wing = cellStr(rowValue(row, map, 'wing'));
    const floor = parseFloorValue(rowValue(row, map, 'floor'));
    const unitNo = cellNum(rowValue(row, map, 'unit_no', 'unit_number'));

    if (!building || !wing || floor == null || unitNo == null || unitNo < 1) {
      warnings.push(
        `Row ${i + 1}: skipped — need building, wing, floor, and unit_no.`
      );
      continue;
    }

    if (!Number.isInteger(unitNo)) {
      warnings.push(`Row ${i + 1}: skipped — unit_no must be a whole number.`);
      continue;
    }

    const key = `${building}|${wing}|${floor}|${unitNo}`;
    if (seenKeys.has(key)) {
      warnings.push(
        `Row ${i + 1}: duplicate unit ${building} › ${wing} › floor ${floor} › #${unitNo} — skipped.`
      );
      continue;
    }
    seenKeys.add(key);

    out.push({
      building,
      wing,
      floor,
      unit_no: unitNo,
      unit_name: cellStr(rowValue(row, map, 'unit_name', 'name')),
      unit_type: cellStr(rowValue(row, map, 'unit_type', 'type')),
      unit_category: cellStr(
        rowValue(row, map, 'unit_category', 'category')
      ),
      carpet_area: cellNum(rowValue(row, map, 'carpet_area', 'carpet')),
      bua_area: cellNum(rowValue(row, map, 'bua_area', 'bua')),
      rera_area: cellNum(rowValue(row, map, 'rera_area', 'rera')),
      terrace_sqft: cellNum(rowValue(row, map, 'terrace_sqft', 'terrace')),
      deck_sqft: cellNum(rowValue(row, map, 'deck_sqft', 'deck')),
      loading_sqft: cellNum(rowValue(row, map, 'loading_sqft', 'loading')),
      rate: cellNum(rowValue(row, map, 'rate', 'base_rate')),
      floor_rise_charge: cellNum(
        rowValue(row, map, 'floor_rise_charge', 'floor_rise')
      ),
      plc_charge: cellNum(rowValue(row, map, 'plc_charge', 'plc')),
      parking_slots: cellNum(
        rowValue(row, map, 'parking_slots', 'parking', 'parking_slots_included')
      )
    });
  }

  if (!out.length) {
    throw new Error('No valid unit rows found in the Units sheet.');
  }

  return out;
}

/** Parse an uploaded project Excel workbook into a draft patch. */
export function parseProjectExcelWorkbook(
  data: ArrayBuffer | Uint8Array
): ProjectExcelParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const warnings: string[] = [];
  const projectPatch = parseProjectSheet(wb, warnings);
  const unitRows = parseUnitsSheet(wb, warnings);
  const baseRate = projectPatch.base_rate ?? 10500;
  const built = buildDraftFromUnitRows(unitRows, baseRate);

  const unitTypesCsv =
    projectPatch.unitTypesCsv?.trim() ||
    (built.unitTypes.length ? built.unitTypes.join(',') : undefined);
  const unitCategoriesCsv =
    projectPatch.unitCategoriesCsv?.trim() ||
    (built.unitCategories.length
      ? built.unitCategories.join(',')
      : undefined);

  if (!unitTypesCsv) {
    warnings.push(
      'No unit types found — add unit_types on Project sheet or unit_type on each Units row.'
    );
  }

  return {
    unitCount: unitRows.length,
    warnings,
    draftPatch: {
      ...projectPatch,
      structures: built.structures,
      floorProvisions: built.floorProvisions,
      floors_per_wing: built.floors_per_wing,
      units_per_floor: built.units_per_floor,
      ...(unitTypesCsv ? { unitTypesCsv } : {}),
      ...(unitCategoriesCsv ? { unitCategoriesCsv } : {})
    }
  };
}

export async function parseProjectExcelFile(
  file: File
): Promise<ProjectExcelParseResult> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new Error('Please upload an Excel file (.xlsx).');
  }
  const buf = await file.arrayBuffer();
  return parseProjectExcelWorkbook(buf);
}

export function buildProjectExcelTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructions = [
    ['BuildCon — Project & Unit import template'],
    [''],
    ['1. Fill the Project sheet (one row of values under the headers).'],
    ['2. Fill the Units sheet — one row per unit.'],
    [
      '3. building + wing + floor + unit_no are required on every Units row.'
    ],
    [
      '4. floor: use 0 or GF for ground floor; 1, 2, … for upper floors.'
    ],
    [
      '5. Upload this file on Create project → Excel import. Inventory and floor config will be filled for you.'
    ],
    [''],
    ['Project type values: Redevelopment, Greenfield, Mixed Use, Development, Ready'],
    ['Status values: Active, Planning, On Hold'],
    ['Do not rename sheet names: Project, Units']
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(instructions),
    PROJECT_EXCEL_INSTRUCTIONS_SHEET
  );

  const projectAoA: unknown[][] = [
    [...PROJECT_EXCEL_PROJECT_HEADERS],
    [
      'Sunrise Residency',
      'Andheri West, Mumbai',
      'Redevelopment',
      'Active',
      '2026-27',
      'P52100012345',
      10500,
      '1BHK,2BHK,3BHK',
      'Residential'
    ]
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(projectAoA),
    PROJECT_EXCEL_PROJECT_SHEET
  );

  const unitsAoA: unknown[][] = [
    [...PROJECT_EXCEL_UNIT_HEADERS],
    [
      'Building 1',
      'Wing A',
      0,
      1,
      'A-GF01',
      '1BHK',
      'Residential',
      450,
      520,
      480,
      0,
      0,
      0,
      10500,
      0,
      0,
      1
    ],
    [
      'Building 1',
      'Wing A',
      0,
      2,
      'A-GF02',
      '2BHK',
      'Residential',
      650,
      740,
      690,
      0,
      0,
      0,
      10500,
      0,
      25000,
      1
    ],
    [
      'Building 1',
      'Wing A',
      1,
      1,
      'A-101',
      '2BHK',
      'Residential',
      650,
      740,
      690,
      40,
      0,
      0,
      10800,
      15000,
      25000,
      1
    ],
    [
      'Building 1',
      'Wing B',
      1,
      1,
      'B-101',
      '3BHK',
      'Residential',
      900,
      1050,
      980,
      60,
      20,
      0,
      11000,
      15000,
      50000,
      2
    ]
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(unitsAoA),
    PROJECT_EXCEL_UNITS_SHEET
  );

  return wb;
}

export function downloadProjectExcelTemplate(
  filename = 'buildcon-project-units-template.xlsx'
) {
  const wb = buildProjectExcelTemplateWorkbook();
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as number[];
  const blob = new Blob([new Uint8Array(out)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
