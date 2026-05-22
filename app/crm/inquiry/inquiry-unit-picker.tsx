'use client';

import { useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ArrowRight,
  ChevronDown,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type {
  ProjectParkingMeta,
  ProjectPricingMeta
} from '../booking-cost-utils';
import { UnitCostSheet } from '../_components/unit-cost-sheet';
import {
  formatInrCompactLacCr,
  formatUnitAgreementValueCompact,
  unitAgreementTotalInr
} from '../inr-format';
import {
  formatFloorLabel,
  normalizeUnitStatusCode,
  STATUS_COLOR,
  statusLabelForUnit
} from '../inventory/inventory-utils';
import { unitStatusInquiryStageHint } from './inquiry-stage-unit-map';
import type { UnitRow } from './inquiry-types';

const UNIT_FILTER_ALL = '__unit_filter_all__';

function UnitStatusPill({
  status,
  className
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const raw = String(status || '').trim();
  const code = normalizeUnitStatusCode(status);
  const bg = STATUS_COLOR[raw] ?? STATUS_COLOR[code] ?? '#94A3B8';
  const label = statusLabelForUnit(status);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold',
        className
      )}
      style={{
        background: `${bg}22`,
        color: bg,
        borderColor: `${bg}44`
      }}
    >
      {label}
    </span>
  );
}

export type UnitPickFilters = {
  projectId: string;
  unitType: string;
  floor: string;
  structure: string;
  search: string;
  unitNo: string;
  minCarpetSqft: string;
  maxCarpetSqft: string;
  minRate: string;
  maxRate: string;
  /** Buyer budget band — filters by total agreement value (₹). */
  minBudget: string;
  maxBudget: string;
  sortBy: UnitPickSort;
};

export type UnitPickSort =
  | 'code_asc'
  | 'floor_desc'
  | 'floor_asc'
  | 'agreement_desc'
  | 'agreement_asc';

export const DEFAULT_UNIT_PICK_FILTERS: UnitPickFilters = {
  projectId: '',
  unitType: '',
  floor: '',
  structure: '',
  search: '',
  unitNo: '',
  minCarpetSqft: '',
  maxCarpetSqft: '',
  minRate: '',
  maxRate: '',
  minBudget: '',
  maxBudget: '',
  sortBy: 'code_asc'
};

export function buildProjectFilterOptions(
  units: UnitRow[]
): [string, string][] {
  const map = new Map<string, string>();
  for (const u of units) {
    if (!u.project_id) continue;
    if (!map.has(u.project_id)) {
      map.set(
        u.project_id,
        String(u.project_name || '').trim() || 'Untitled project'
      );
    }
  }
  return [...map.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: 'base' })
  );
}

export function buildUnitPickFilterOptions(units: UnitRow[]) {
  const typeSet = new Set<string>();
  const floors = new Set<number>();
  const structures = new Set<string>();
  for (const u of units) {
    const t = String(u.unit_type || '').trim();
    if (t) typeSet.add(t);
    if (Number.isFinite(u.floor)) floors.add(u.floor);
    const w = String(u.wing_name || '').trim();
    if (w) structures.add(w);
  }
  return {
    unitTypes: [...typeSet].sort((a, b) => a.localeCompare(b)),
    floors: [...floors].sort((a, b) => b - a),
    structures: [...structures].sort((a, b) => a.localeCompare(b))
  };
}

function normalizeFilterToken(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Map step-1 “What are they looking for?” fields onto unit-picker filters. */
export function unitPickFiltersFromSellerPreferences(
  units: UnitRow[],
  prefs: {
    interestedIn?: string;
    preferredLocation?: string;
    preferredWing?: string;
    budgetMin?: string;
    budgetMax?: string;
  }
): UnitPickFilters {
  const filters: UnitPickFilters = { ...DEFAULT_UNIT_PICK_FILTERS };

  const minBudget = String(prefs.budgetMin || '').trim();
  const maxBudget = String(prefs.budgetMax || '').trim();
  if (minBudget) filters.minBudget = minBudget;
  if (maxBudget) filters.maxBudget = maxBudget;

  const projectOpts = buildProjectFilterOptions(units);
  const filterOpts = buildUnitPickFilterOptions(units);

  const interested = String(prefs.interestedIn || '').trim();
  if (interested) {
    const norm = normalizeFilterToken(interested);
    const exact = filterOpts.unitTypes.find(
      (t) => normalizeFilterToken(t) === norm
    );
    const partial = filterOpts.unitTypes.find((t) => {
      const tn = normalizeFilterToken(t);
      return tn.includes(norm) || norm.includes(tn);
    });
    if (exact || partial) {
      filters.unitType = exact ?? partial ?? '';
    } else {
      filters.search = interested;
    }
  }

  const wing = String(prefs.preferredWing || '').trim();
  if (wing) {
    const wingLower = wing.toLowerCase();
    const structure =
      filterOpts.structures.find((s) => s.toLowerCase() === wingLower) ??
      filterOpts.structures.find(
        (s) =>
          s.toLowerCase().includes(wingLower) ||
          wingLower.includes(s.toLowerCase())
      );
    if (structure) {
      filters.structure = structure;
    } else if (!filters.search) {
      filters.search = wing;
    } else if (!filters.search.toLowerCase().includes(wingLower)) {
      filters.search = `${filters.search} ${wing}`;
    }
  }

  const loc = String(prefs.preferredLocation || '').trim();
  if (loc) {
    const locLower = loc.toLowerCase();
    const proj = projectOpts.find(
      ([, name]) =>
        name.toLowerCase().includes(locLower) ||
        locLower.includes(name.toLowerCase())
    );
    if (proj) {
      filters.projectId = proj[0];
    } else if (!filters.search) {
      filters.search = loc;
    } else if (!filters.search.toLowerCase().includes(locLower)) {
      filters.search = `${filters.search} ${loc}`;
    }
  }

  return filters;
}

function parseOptionalNumber(raw: string): number | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function unitMatchesSearch(u: UnitRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    u.unit_code,
    u.wing_name,
    u.project_name,
    u.unit_type,
    u.unit_no != null ? String(u.unit_no) : '',
    formatFloorLabel(u.floor, u.unit_type)
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function filterAndSortUnits(
  units: UnitRow[],
  filters: UnitPickFilters
): UnitRow[] {
  const pid = String(filters.projectId || '').trim();
  const wantType = String(filters.unitType || '').trim();
  const wantFloor = String(filters.floor || '').trim();
  const wantStructure = String(filters.structure || '').trim();
  const wantUnitNo = String(filters.unitNo || '').trim();
  const q = String(filters.search || '').trim().toLowerCase();
  const minCarpet = parseOptionalNumber(filters.minCarpetSqft);
  const maxCarpet = parseOptionalNumber(filters.maxCarpetSqft);
  const minRate = parseOptionalNumber(filters.minRate);
  const maxRate = parseOptionalNumber(filters.maxRate);
  const minBudget = parseOptionalNumber(filters.minBudget);
  const maxBudget = parseOptionalNumber(filters.maxBudget);

  let list = units.filter((u) => {
    if (pid && u.project_id !== pid) return false;
    if (wantType && String(u.unit_type || '').trim() !== wantType) return false;
    if (wantFloor && String(u.floor) !== wantFloor) return false;
    if (wantStructure && String(u.wing_name || '').trim() !== wantStructure)
      return false;
    if (wantUnitNo && String(u.unit_no) !== wantUnitNo) return false;
    if (!unitMatchesSearch(u, q)) return false;

    const carpet = Number(u.carpet_area);
    if (minCarpet != null && (!Number.isFinite(carpet) || carpet < minCarpet))
      return false;
    if (maxCarpet != null && (!Number.isFinite(carpet) || carpet > maxCarpet))
      return false;

    const rate = Number(u.rate);
    if (minRate != null && (!Number.isFinite(rate) || rate < minRate))
      return false;
    if (maxRate != null && (!Number.isFinite(rate) || rate > maxRate))
      return false;

    if (minBudget != null || maxBudget != null) {
      const agreement = unitAgreementTotalInr(u);
      if (agreement <= 0) return false;
      if (minBudget != null && agreement < minBudget) return false;
      if (maxBudget != null && agreement > maxBudget) return false;
    }

    return true;
  });

  const sortBy = filters.sortBy;
  list = [...list].sort((a, b) => {
    switch (sortBy) {
      case 'floor_desc':
        return b.floor - a.floor || a.unit_code.localeCompare(b.unit_code);
      case 'floor_asc':
        return a.floor - b.floor || a.unit_code.localeCompare(b.unit_code);
      case 'agreement_desc':
        return (
          unitAgreementTotalInr(b) - unitAgreementTotalInr(a) ||
          a.unit_code.localeCompare(b.unit_code)
        );
      case 'agreement_asc':
        return (
          unitAgreementTotalInr(a) - unitAgreementTotalInr(b) ||
          a.unit_code.localeCompare(b.unit_code)
        );
      case 'code_asc':
      default:
        return a.unit_code.localeCompare(b.unit_code, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
    }
  });

  return list;
}

export function countActiveUnitFilters(filters: UnitPickFilters): number {
  let n = 0;
  if (filters.projectId) n++;
  if (filters.unitType) n++;
  if (filters.floor) n++;
  if (filters.structure) n++;
  if (filters.search.trim()) n++;
  if (filters.unitNo.trim()) n++;
  if (filters.minCarpetSqft.trim()) n++;
  if (filters.maxCarpetSqft.trim()) n++;
  if (filters.minRate.trim()) n++;
  if (filters.maxRate.trim()) n++;
  if (filters.minBudget.trim()) n++;
  if (filters.maxBudget.trim()) n++;
  if (filters.sortBy !== 'code_asc') n++;
  return n;
}


function SelectedUnitCompactBanner({
  unit,
  onChangeUnit
}: {
  unit: UnitRow;
  onChangeUnit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ds-primary-200 bg-ds-primary-50/60 px-4 py-3 ring-1 ring-ds-primary-100">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ds-primary-700">
          Unit selected
        </p>
        <p className="text-sm font-bold text-ds-gray-900">{unit.unit_code}</p>
        <p className="text-[11px] text-ds-gray-600">
          {unit.project_name?.trim() || 'Project'} · {unit.wing_name || '—'} ·{' '}
          {formatFloorLabel(unit.floor, unit.unit_type)}
        </p>
        <p className="mt-1 text-[11px] text-ds-primary-700">
          Review the cost sheet below, then continue to save and record the site
          visit.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 shrink-0 border-ds-primary-200"
        onClick={onChangeUnit}
      >
        Change unit
      </Button>
    </div>
  );
}

function SelectedUnitCard({
  unit,
  onChangeUnit
}: {
  unit: UnitRow;
  onChangeUnit: () => void;
}) {
  const totalInr = unitAgreementTotalInr(unit);

  return (
    <div className="overflow-hidden rounded-xl border border-ds-primary-200 bg-white shadow-sm ring-1 ring-ds-primary-100">
      <div className="border-b border-ds-primary-100 bg-gradient-to-br from-ds-primary-50 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ds-primary-700">
              Selected unit
            </p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-ds-gray-900">
              {unit.unit_code}
            </h3>
            <p className="mt-1 text-xs text-ds-gray-600">
              {unit.project_name?.trim() || 'Project'} · {unit.wing_name || '—'}{' '}
              · {formatFloorLabel(unit.floor, unit.unit_type)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <UnitStatusPill status={unit.status} />
            <Button
              type="button"
              variant="outline"
              className="border-ds-primary-200 text-ds-primary-700 hover:bg-ds-primary-50"
              onClick={onChangeUnit}
            >
              Change unit
            </Button>
          </div>
        </div>
        <div className="mt-3 inline-flex items-baseline gap-2 rounded-lg bg-white/80 px-3 py-2 ring-1 ring-ds-primary-100">
          <span className="text-[10px] font-semibold uppercase text-ds-gray-500">
            Est. agreement
          </span>
          <span className="text-base font-bold text-ds-primary-700">
            {formatInrCompactLacCr(totalInr)}
          </span>
        </div>
      </div>
    </div>
  );
}

type InquiryUnitPickerProps = {
  selectableUnits: UnitRow[];
  loadingUnits: boolean;
  selectedUnit: UnitRow | null;
  selectedUnitId: string;
  onSelectUnitId: (unitId: string, unitType?: string | null) => void;
  filters: UnitPickFilters;
  setFilters: Dispatch<SetStateAction<UnitPickFilters>>;
  /** Step 2 only: search/select unit; parking and cost sheet on the next step. */
  selectionOnly?: boolean;
  projectParking?: ProjectParkingMeta | null;
  projectPricing?: ProjectPricingMeta | null;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  parkingSection?: ReactNode;
  parkingRequired?: 'Yes' | 'No';
  parkingCount?: string;
};

export function InquiryUnitPicker({
  selectableUnits,
  loadingUnits,
  selectedUnit,
  selectedUnitId,
  onSelectUnitId,
  filters,
  setFilters,
  selectionOnly = false,
  notes = '',
  onNotesChange,
  parkingSection,
  projectParking = null,
  projectPricing = null,
  parkingRequired = 'No',
  parkingCount = '1'
}: InquiryUnitPickerProps) {
  const [previewUnit, setPreviewUnit] = useState<UnitRow | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const unitsAfterProject = useMemo(() => {
    const pid = String(filters.projectId || '').trim();
    if (!pid) return selectableUnits;
    return selectableUnits.filter((u) => u.project_id === pid);
  }, [selectableUnits, filters.projectId]);

  const projectFilterOptions = useMemo(
    () => buildProjectFilterOptions(selectableUnits),
    [selectableUnits]
  );

  const filterOptions = useMemo(
    () => buildUnitPickFilterOptions(unitsAfterProject),
    [unitsAfterProject]
  );

  const filteredUnits = useMemo(
    () => filterAndSortUnits(selectableUnits, filters),
    [selectableUnits, filters]
  );

  const activeFilterCount = countActiveUnitFilters(filters);

  const unitNoOptions = useMemo(() => {
    const set = new Set<number>();
    for (const u of unitsAfterProject) {
      if (Number.isFinite(u.unit_no)) set.add(u.unit_no);
    }
    return [...set].sort((a, b) => a - b);
  }, [unitsAfterProject]);

  function clearAllFilters() {
    setFilters(DEFAULT_UNIT_PICK_FILTERS);
    setAdvancedOpen(false);
  }

  function confirmPreviewSelection() {
    if (!previewUnit) return;
    onSelectUnitId(previewUnit.id, previewUnit.unit_type);
    setPreviewUnit(null);
  }

  function clearSelection() {
    onSelectUnitId('');
  }

  return (
    <div className="space-y-4">
      <Dialog
        open={previewUnit !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewUnit(null);
        }}
      >
        <DialogContent className="max-h-[min(92dvh,720px)] w-[calc(100vw-1.5rem)] max-w-2xl gap-0 overflow-hidden border-ds-gray-200 p-0 sm:max-w-2xl">
          {previewUnit ? (
            <>
              <DialogHeader className="border-b border-ds-gray-100 bg-gradient-to-br from-ds-primary-50/80 to-white px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <DialogTitle className="text-lg font-bold text-ds-gray-900">
                      {previewUnit.unit_code}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-ds-gray-600">
                      {previewUnit.project_name?.trim() || 'Project'} ·{' '}
                      {previewUnit.wing_name || '—'} ·{' '}
                      {formatFloorLabel(previewUnit.floor, previewUnit.unit_type)}
                    </DialogDescription>
                  </div>
                  <UnitStatusPill status={previewUnit.status} />
                </div>
                <p className="mt-2 text-sm font-bold text-ds-primary-700">
                  {formatUnitAgreementValueCompact(previewUnit)}
                </p>
              </DialogHeader>
              <div className="max-h-[min(58vh,440px)] overflow-y-auto px-4 py-4 sm:px-5">
                <UnitCostSheet
                  unit={previewUnit}
                  parkingRequired={parkingRequired}
                  parkingCount={parkingCount}
                  projectParking={projectParking}
                  projectPricing={projectPricing}
                  className="border-0 p-0 shadow-none"
                />
                <p className="mt-3 text-[11px] leading-snug text-ds-gray-600">
                  {unitStatusInquiryStageHint(previewUnit.status)}
                </p>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 border-t border-ds-gray-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setPreviewUnit(null)}
                >
                  Back to list
                </Button>
                <Button
                  type="button"
                  className="w-full gap-1.5 sm:w-auto"
                  onClick={confirmPreviewSelection}
                >
                  Select this unit
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Search + quick filters */}
      <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="unit-search" className="text-sm text-ds-gray-600">
              Search units
            </Label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-gray-400"
                aria-hidden
              />
              <Input
                id="unit-search"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                placeholder="Code, wing, project, floor, type…"
                className="pl-9 text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            variant={advancedOpen ? 'default' : 'outline'}
            className="shrink-0 gap-2"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Advanced
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-ds-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-ds-primary-800">
                {activeFilterCount}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                'size-4 transition-transform',
                advancedOpen && 'rotate-180'
              )}
              aria-hidden
            />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Project"
            value={filters.projectId === '' ? UNIT_FILTER_ALL : filters.projectId}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                projectId: v === UNIT_FILTER_ALL ? '' : v,
                unitType: '',
                floor: '',
                structure: '',
                unitNo: ''
              }))
            }
            allLabel="All projects"
            options={projectFilterOptions.map(([id, name]) => ({
              value: id,
              label: name
            }))}
          />
          <FilterSelect
            label="Type"
            value={filters.unitType === '' ? UNIT_FILTER_ALL : filters.unitType}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                unitType: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
            allLabel="All types"
            options={filterOptions.unitTypes.map((t) => ({
              value: t,
              label: t
            }))}
          />
          <FilterSelect
            label="Floor"
            value={filters.floor === '' ? UNIT_FILTER_ALL : filters.floor}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                floor: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
            allLabel="All floors"
            options={filterOptions.floors.map((fl) => ({
              value: String(fl),
              label: formatFloorLabel(fl, null)
            }))}
          />
          <FilterSelect
            label="Wing"
            value={
              filters.structure === '' ? UNIT_FILTER_ALL : filters.structure
            }
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                structure: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
            allLabel="All wings"
            options={filterOptions.structures.map((w) => ({
              value: w,
              label: w
            }))}
          />
        </div>

        {advancedOpen ? (
          <div className="mt-3 space-y-3 border-t border-ds-gray-100 pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FilterSelect
                label="Unit slot on floor"
                value={
                  filters.unitNo === '' ? UNIT_FILTER_ALL : filters.unitNo
                }
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    unitNo: v === UNIT_FILTER_ALL ? '' : v
                  }))
                }
                allLabel="Any slot"
                options={unitNoOptions.map((n) => ({
                  value: String(n),
                  label: `Slot ${n}`
                }))}
              />
              <FilterSelect
                label="Sort by"
                value={filters.sortBy}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, sortBy: v as UnitPickSort }))
                }
                allLabel=""
                hideAll
                options={[
                  { value: 'code_asc', label: 'Unit code (A–Z)' },
                  { value: 'floor_desc', label: 'Floor (high → low)' },
                  { value: 'floor_asc', label: 'Floor (low → high)' },
                  { value: 'agreement_desc', label: 'Agreement (high → low)' },
                  { value: 'agreement_asc', label: 'Agreement (low → high)' }
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <NumberFilter
                label="Min budget (₹)"
                value={filters.minBudget}
                onChange={(v) => setFilters((f) => ({ ...f, minBudget: v }))}
              />
              <NumberFilter
                label="Max budget (₹)"
                value={filters.maxBudget}
                onChange={(v) => setFilters((f) => ({ ...f, maxBudget: v }))}
              />
              <NumberFilter
                label="Min carpet (sq.ft)"
                value={filters.minCarpetSqft}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, minCarpetSqft: v }))
                }
              />
              <NumberFilter
                label="Max carpet (sq.ft)"
                value={filters.maxCarpetSqft}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, maxCarpetSqft: v }))
                }
              />
              <NumberFilter
                label="Min rate (₹/sq.ft)"
                value={filters.minRate}
                onChange={(v) => setFilters((f) => ({ ...f, minRate: v }))}
              />
              <NumberFilter
                label="Max rate (₹/sq.ft)"
                value={filters.maxRate}
                onChange={(v) => setFilters((f) => ({ ...f, maxRate: v }))}
              />
            </div>
            <p className="text-[10px] leading-snug text-ds-gray-500">
              Budget uses estimated agreement total (base + floor rise + PLC).
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ds-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ds-gray-600">
            <span className="font-semibold text-ds-gray-800">
              {loadingUnits ? 'Loading…' : `${filteredUnits.length} units`}
            </span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-ds-primary-700 hover:bg-ds-primary-50"
              >
                <X className="size-3.5" aria-hidden />
                Clear filters ({activeFilterCount})
              </button>
            ) : null}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-ds-gray-200">
            <button
              type="button"
              aria-pressed={viewMode === 'grid'}
              className={cn(
                'flex min-h-9 min-w-9 items-center justify-center px-2.5',
                viewMode === 'grid'
                  ? 'bg-ds-primary-500 text-white'
                  : 'bg-white text-ds-gray-600 hover:bg-ds-gray-50'
              )}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <LayoutGrid className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              className={cn(
                'flex min-h-9 min-w-9 items-center justify-center px-2.5',
                viewMode === 'list'
                  ? 'bg-ds-primary-500 text-white'
                  : 'bg-white text-ds-gray-600 hover:bg-ds-gray-50'
              )}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <p className="mb-2 text-[11px] text-ds-gray-500">
          Tap a unit to preview full details, then confirm your choice.
        </p>
        <div className="max-h-[min(400px,52vh)] overflow-y-auto rounded-xl border border-ds-gray-200 bg-ds-gray-50/40 p-2">
          {filteredUnits.length === 0 ? (
            <div className="rounded-lg border border-ds-warning-200 bg-ds-warning-50 px-3 py-4 text-xs text-ds-warning-900">
              No units match — adjust search or filters, or check inventory
              status.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUnits.map((u) => (
                <UnitResultCard
                  key={u.id}
                  unit={u}
                  active={selectedUnitId === u.id}
                  onClick={() => setPreviewUnit(u)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredUnits.map((u) => (
                <UnitResultRow
                  key={u.id}
                  unit={u}
                  active={selectedUnitId === u.id}
                  onClick={() => setPreviewUnit(u)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedUnit ? (
        selectionOnly ? (
          <SelectedUnitCompactBanner
            unit={selectedUnit}
            onChangeUnit={clearSelection}
          />
        ) : (
          <div className="space-y-4">
            <SelectedUnitCard unit={selectedUnit} onChangeUnit={clearSelection} />
            {parkingSection ? (
              <div className="space-y-3 rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-ds-gray-800">
                  Parking & requirements
                </p>
                {parkingSection}
                {onNotesChange ? (
                  <div>
                    <Label className="text-sm text-ds-gray-600">
                      Requirements / notes
                    </Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => onNotesChange(e.target.value)}
                      rows={3}
                      placeholder="Higher floor, corner, sea view, budget, Vastu…"
                      className="mt-1 min-h-16 resize-y text-sm"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <UnitCostSheet
              unit={selectedUnit}
              parkingRequired={parkingRequired}
              parkingCount={parkingCount}
              projectParking={projectParking}
              projectPricing={projectPricing}
            />
          </div>
        )
      ) : (
        <p className="text-[11px] text-ds-gray-500">
          {selectionOnly
            ? 'Select a unit, then continue to the next step.'
            : 'Select a unit from the list to see the full cost sheet.'}
        </p>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  allLabel,
  options,
  hideAll
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
  hideAll?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-sm text-ds-gray-600">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn(formControlFieldGapClass, 'w-full text-sm')}>
          <SelectValue placeholder={allLabel || label} />
        </SelectTrigger>
        <SelectContent>
          {!hideAll ? (
            <SelectItem value={UNIT_FILTER_ALL}>{allLabel}</SelectItem>
          ) : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberFilter({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-sm text-ds-gray-600">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Any"
        className={cn(formControlFieldGapClass, 'text-sm')}
      />
    </div>
  );
}

function UnitResultCard({
  unit,
  active,
  onClick
}: {
  unit: UnitRow;
  active: boolean;
  onClick: () => void;
}) {
  const projectLabel = unit.project_name?.trim() || 'Project';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[88px] w-full rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-ds-primary-500 bg-ds-primary-50 shadow-sm ring-1 ring-ds-primary-200'
          : 'border-ds-gray-200 bg-white hover:border-ds-primary-200 hover:bg-ds-gray-50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium text-ds-gray-500">
          {projectLabel}
        </span>
        <UnitStatusPill status={unit.status} />
      </div>
      <div className="mt-1 text-sm font-bold text-ds-gray-900">{unit.unit_code}</div>
      <p className="mt-0.5 text-[11px] text-ds-gray-600">
        {unit.wing_name || '—'} · {unit.unit_type ?? '—'} ·{' '}
        {formatFloorLabel(unit.floor, unit.unit_type)}
      </p>
      <p className="mt-2 text-xs font-semibold text-ds-primary-600">
        {formatUnitAgreementValueCompact(unit)}
      </p>
      {unit.carpet_area != null && Number(unit.carpet_area) > 0 ? (
        <p className="mt-0.5 text-[10px] text-ds-gray-500">
          Carpet {unit.carpet_area} sq.ft
        </p>
      ) : null}
    </button>
  );
}

function UnitResultRow({
  unit,
  active,
  onClick
}: {
  unit: UnitRow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
        active
          ? 'border-ds-primary-500 bg-ds-primary-50'
          : 'border-ds-gray-200 bg-white hover:bg-ds-gray-50'
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="font-bold text-ds-gray-900">{unit.unit_code}</span>
        <span className="mx-1.5 text-ds-gray-300">·</span>
        <span className="text-ds-gray-600">
          {unit.project_name?.trim() || 'Project'} · {unit.wing_name || '—'} ·{' '}
          {formatFloorLabel(unit.floor, unit.unit_type)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold text-ds-primary-600">
          {formatUnitAgreementValueCompact(unit)}
        </span>
        <UnitStatusPill status={unit.status} />
      </div>
    </button>
  );
}
