import type { FloorProvisionDraft, StructureNode } from './project-structure-utils';
import {
  countProjectUnits,
  deriveLegacyWingsFromStructures,
  defaultRootStructures,
  normalizeStructures
} from './project-structure-utils';

export const WIZARD_STEPS = [
  'Basic Info',
  'Inventory Config',
  'Floor Configure',
  'Rates',
  'Users & Access',
  'Review'
] as const;

export type CreateProjectDraft = {
  name: string;
  location: string;
  type: 'Redevelopment' | 'Greenfield' | 'Mixed Use' | 'Development' | 'Ready';
  status: 'Active' | 'Planning' | 'On Hold';
  fy: string;
  rera_no: string;
  floors_per_wing: number;
  units_per_floor: number;
  base_rate: number;
  min_rate: number;
  max_rate: number;
  unitTypesCsv: string;
  memberIds: string[];
  structures: StructureNode[];
  floorProvisions: FloorProvisionDraft[];
};

export function wingsFromDraft(d: CreateProjectDraft) {
  return deriveLegacyWingsFromStructures(d.structures);
}

/** Comma-separated unit types from the inventory step (deduped, trimmed). */
export function parseUnitTypesCsv(csv: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of csv.split(',')) {
    const t = part.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** First unit type from step 2 CSV (default for step 3 unit rows). */
export function firstUnitTypeFromCsv(csv: string): string {
  return parseUnitTypesCsv(csv)[0] ?? '';
}

function unitTypesFromFloorProvisions(draft: CreateProjectDraft): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of draft.floorProvisions) {
    for (const u of row.unitConfigs || []) {
      const t = (u.type || '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Unit type catalog sent to the API (CSV + any types picked on the floor step). */
export function unitTypesFromDraft(draft: CreateProjectDraft): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [
    ...parseUnitTypesCsv(draft.unitTypesCsv),
    ...unitTypesFromFloorProvisions(draft)
  ]) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Fill empty unit types on floor rows with the first type from step 2. */
export function applyDefaultUnitTypeToFloorProvisions(
  provisions: FloorProvisionDraft[],
  defaultUnitType: string
): FloorProvisionDraft[] {
  const fallback = defaultUnitType.trim();
  if (!fallback) return provisions;
  return provisions.map((row) => ({
    ...row,
    unitConfigs: (row.unitConfigs || []).map((u) => ({
      ...u,
      type: (u.type || '').trim() || fallback
    }))
  }));
}

export function validateFloorUnitTypesAssigned(
  draft: CreateProjectDraft
): string | null {
  if (!draft.floorProvisions.length) return null;
  for (const row of draft.floorProvisions) {
    for (const u of row.unitConfigs || []) {
      if (!(u.type || '').trim()) {
        return 'Every unit must have a unit type (select a type for each unit).';
      }
    }
  }
  return null;
}

export function validateCreateDraft(draft: CreateProjectDraft): string | null {
  for (let step = 0; step <= 3; step++) {
    const err = validateCreateStep(step, draft);
    if (err) return err;
  }
  return validateFloorUnitTypesAssigned(draft);
}

export function validateCreateStep(
  step: number,
  draft: CreateProjectDraft
): string | null {
  if (step === 0) {
    if (!draft.name.trim()) return 'Project name is required.';
    return null;
  }
  if (step === 1) {
    if (!parseUnitTypesCsv(draft.unitTypesCsv).length) {
      return 'Add at least one unit type (comma-separated, e.g. 1BHK, 2BHK).';
    }
    if (normalizeStructures(draft.structures).length < 1) {
      return 'Add at least one structure (root).';
    }
    if (countProjectUnits(draft.structures) < 1) {
      return 'Each structure needs at least one leaf with floors and units.';
    }
    if (draft.floors_per_wing < 1) return 'Default floors must be at least 1.';
    if (draft.units_per_floor < 1) return 'Default units per floor must be at least 1.';
    return null;
  }
  if (step === 2) {
    if (!draft.floorProvisions.length) {
      return 'Configure floors (use Auto-fill floors) before continuing.';
    }
    return validateFloorUnitTypesAssigned(draft);
  }
  if (step === 3) {
    if (draft.base_rate < 0 || draft.min_rate < 0 || draft.max_rate < 0) {
      return 'Rates cannot be negative.';
    }
    return null;
  }
  return null;
}

export function createInitialDraft(): CreateProjectDraft {
  return {
    name: '',
    location: '',
    type: 'Redevelopment',
    status: 'Active',
    fy: '2026-27',
    rera_no: '',
    floors_per_wing: 7,
    units_per_floor: 4,
    base_rate: 10500,
    min_rate: 9500,
    max_rate: 13000,
    unitTypesCsv: '1BHK,2BHK,3BHK',
    memberIds: [],
    structures: defaultRootStructures(7, 4),
    floorProvisions: []
  };
}

export function resetDraft(): CreateProjectDraft {
  return createInitialDraft();
}
