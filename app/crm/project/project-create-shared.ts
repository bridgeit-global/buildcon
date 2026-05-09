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
  type: 'Redevelopment' | 'Greenfield' | 'Mixed Use';
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

export function validateCreateStep(
  step: number,
  draft: CreateProjectDraft
): string | null {
  if (step === 0) {
    if (!draft.name.trim()) return 'Project name is required.';
    return null;
  }
  if (step === 1) {
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
    return null;
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
