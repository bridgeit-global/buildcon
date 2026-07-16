import { defaultProjectFy } from '@/lib/project/project-fy';
import type { FloorProvisionDraft, StructureNode } from './project-structure-utils';
import {
  isProjectNameTaken,
  PROJECT_NAME_DUPLICATE_ERROR,
  type ProjectNameRow
} from '@/lib/project/project-name';
import { z } from 'zod';
import {
  countProjectUnits,
  deriveLegacyWingsFromStructures,
  defaultRootStructures,
  getStructureLeaves,
  normalizeStructures
} from './project-structure-utils';

export const CREATE_PROJECT_WIZARD_STEPS = [
  {
    id: 'basics',
    label: 'Basic Details',
    description: 'Name, location, type and base rate'
  },
  {
    id: 'inventory',
    label: 'Inventory Config',
    description: 'Buildings, wings and floor setup'
  },
  {
    id: 'units',
    label: 'Unit Setup',
    description: 'Per-floor units, areas and rates'
  },
  {
    id: 'review',
    label: 'Review & Team',
    description: 'Assign members and confirm'
  }
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
  unitTypesCsv: string;
  unitCategoriesCsv: string;
  memberIds: string[];
  structures: StructureNode[];
  floorProvisions: FloorProvisionDraft[];
};

export function wingsFromDraft(d: CreateProjectDraft) {
  return deriveLegacyWingsFromStructures(d.structures);
}

function parseCommaSeparatedCsv(csv: string): string[] {
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

/** Comma-separated unit types from the inventory step (deduped, trimmed). */
export function parseUnitTypesCsv(csv: string): string[] {
  return parseCommaSeparatedCsv(csv);
}

/** Comma-separated unit categories from the inventory step (deduped, trimmed). */
export function parseUnitCategoriesCsv(csv: string): string[] {
  return parseCommaSeparatedCsv(csv);
}

export const createProjectStep0Schema = z.object({
  name: z.string().trim().min(1, 'Project name is required.'),
  location: z.string().trim().min(1, 'Location is required.'),
  base_rate: z.number().min(0, 'Rate cannot be negative.')
});

export type CreateProjectValidationOptions = {
  existingProjects?: Iterable<ProjectNameRow>;
};

export function createProjectStep0SchemaWithExisting(
  existingProjects?: Iterable<ProjectNameRow>
) {
  return createProjectStep0Schema.superRefine((data, ctx) => {
    if (
      existingProjects &&
      isProjectNameTaken(data.name, existingProjects)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: PROJECT_NAME_DUPLICATE_ERROR,
        path: ['name']
      });
    }
  });
}

export const createProjectStep1FieldsSchema = z.object({
  unitTypesCsv: z.string().superRefine((val, ctx) => {
    if (!parseUnitTypesCsv(val).length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Add at least one unit type (comma-separated, e.g. 1BHK, 2BHK).'
      });
    }
  })
});

export type CreateProjectStep0Values = z.infer<typeof createProjectStep0Schema>;
export type CreateProjectStep1FieldValues = z.infer<
  typeof createProjectStep1FieldsSchema
>;

/** First unit type from step 2 CSV (default for step 3 unit rows). */
export function firstUnitTypeFromCsv(csv: string): string {
  return parseUnitTypesCsv(csv)[0] ?? '';
}

/** First unit category from step 2 CSV (default for floor unit rows). */
export function firstUnitCategoryFromCsv(csv: string): string {
  return parseUnitCategoriesCsv(csv)[0] ?? '';
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

/** Fill empty unit categories on floor rows with the first category from step 2. */
export function applyDefaultUnitCategoryToFloorProvisions(
  provisions: FloorProvisionDraft[],
  defaultUnitCategory: string
): FloorProvisionDraft[] {
  const fallback = defaultUnitCategory.trim();
  if (!fallback) return provisions;
  return provisions.map((row) => ({
    ...row,
    unitConfigs: (row.unitConfigs || []).map((u) => ({
      ...u,
      category: (u.category || '').trim() || fallback
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

export function validateCreateDraft(
  draft: CreateProjectDraft,
  options?: CreateProjectValidationOptions
): string | null {
  for (let step = 0; step <= 2; step++) {
    const err = validateCreateStep(step, draft, options);
    if (err) return err;
  }
  return validateFloorUnitTypesAssigned(draft);
}

export function validateCreateStep(
  step: number,
  draft: CreateProjectDraft,
  options?: CreateProjectValidationOptions
): string | null {
  if (step === 0) {
    if (!draft.name.trim()) return 'Project name is required.';
    const duplicate = options?.existingProjects
      ? isProjectNameTaken(draft.name, options.existingProjects)
      : false;
    if (duplicate) return PROJECT_NAME_DUPLICATE_ERROR;
    if (!draft.location.trim()) return 'Location is required.';
    if (draft.base_rate < 0) return 'Rate cannot be negative.';
    return null;
  }
  if (step === 1) {
    if (!parseUnitTypesCsv(draft.unitTypesCsv).length) {
      return 'Add at least one unit type (comma-separated, e.g. 1BHK, 2BHK).';
    }
    if (normalizeStructures(draft.structures).length < 1) {
      return 'Add at least one building.';
    }
    if (getStructureLeaves(normalizeStructures(draft.structures)).length < 1) {
      return 'Each wing needs at least one floor (Building → Wing → Floor → Unit).';
    }
    if (countProjectUnits(draft.structures) < 1) {
      return 'Each floor needs at least one unit.';
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
  return null;
}

export function createInitialDraft(): CreateProjectDraft {
  return {
    name: '',
    location: '',
    type: 'Redevelopment',
    status: 'Active',
    fy: defaultProjectFy('Redevelopment'),
    rera_no: '',
    floors_per_wing: 7,
    units_per_floor: 4,
    base_rate: 10500,
    unitTypesCsv: '1BHK,2BHK,3BHK',
    unitCategoriesCsv: 'Residential',
    memberIds: [],
    structures: defaultRootStructures(7, 4),
    floorProvisions: []
  };
}

export function resetDraft(): CreateProjectDraft {
  return createInitialDraft();
}
