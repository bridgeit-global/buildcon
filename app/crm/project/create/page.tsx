'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TextInputField } from '@/components/ui/text-input-field';
import { ProjectLocationField } from '../project-location-field';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import {
  buildDefaultFloorProvisions,
  countProjectUnits,
  normalizeStructures,
  getStructureLeaves,
  projectParkingAvgRatePerSlot,
  projectParkingTotal,
  projectParkingValueTotal
} from '../project-structure-utils';
import {
  FloorConfigureStep,
  InventoryConfigSummary,
  StructureTreeFields
} from '../project-create-inventory';
import {
  WIZARD_STEPS,
  type CreateProjectDraft,
  createProjectStep0SchemaWithExisting,
  createProjectStep1FieldsSchema,
  createProjectStep3Schema,
  wingsFromDraft,
  validateCreateStep,
  validateCreateDraft,
  parseUnitTypesCsv,
  firstUnitTypeFromCsv,
  applyDefaultUnitTypeToFloorProvisions,
  unitTypesFromDraft,
  createInitialDraft,
  resetDraft
} from '../project-create-shared';
import BackButton from '@/components/buttons/back-button';
import { coerceProjectFy, isReadyProjectType } from '@/lib/project/project-fy';
import { ProjectFySelect } from '../project-fy-select';

type ProfileRow = { id: string; name: string | null; role: string };
type ProjectNameRow = { id: string; name: string };

function profileOptionLabel(p: ProfileRow): string {
  return `${p.name || 'Unnamed user'} (${p.role})`;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [existingProjects, setExistingProjects] = useState<ProjectNameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createStep, setCreateStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [addMemberPickerKey, setAddMemberPickerKey] = useState(0);
  const [draft, setDraft] = useState<CreateProjectDraft>(() =>
    createInitialDraft()
  );

  const canCreateProject = myProfile?.role === 'Super Admin';
  const lastWizardStep = WIZARD_STEPS.length - 1;
  const projectWizardSteps = useMemo(
    () =>
      WIZARD_STEPS.map((label, i) => ({
        id: String(i),
        label
      })),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/crm/project');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? null) as ProfileRow | null;
      setMyProfile(row);
      if (row?.role !== 'Super Admin') {
        router.replace('/crm/project');
        return;
      }
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id,name,role')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!cancelled && !profErr) {
        setProfiles((profs ?? []) as ProfileRow[]);
      }
      const { data: projects, error: projectErr } = await supabase
        .from('projects')
        .select('id,name')
        .order('name', { ascending: true });
      if (!cancelled && !projectErr) {
        setExistingProjects((projects ?? []) as ProjectNameRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const availableMemberProfiles = useMemo(
    () => profiles.filter((p) => !draft.memberIds.includes(p.id)),
    [profiles, draft.memberIds]
  );

  const clearAllMembers = () => setDraft((d) => ({ ...d, memberIds: [] }));

  const removeMemberChip = (id: string) =>
    setDraft((d) => ({ ...d, memberIds: d.memberIds.filter((x) => x !== id) }));

  async function createProject() {
    setCreating(true);
        try {
      const validationErr = validateCreateDraft(draft, { existingProjects });
      if (validationErr) {
        pageError(validationErr);
        return;
      }

      const wings = wingsFromDraft(draft);
      const unitTypes = unitTypesFromDraft(draft);

      const metaFloors = Math.max(
        1,
        ...draft.floorProvisions.map((p) => Number(p.floor) || 0),
        draft.floors_per_wing || 1
      );
      const metaUnits = Math.max(
        1,
        ...draft.floorProvisions.map((p) => Number(p.unitsPerFloor) || 0),
        draft.units_per_floor || 1
      );

      const parkingSlotsTotal = projectParkingTotal(draft.structures);
      const parkingAvg = projectParkingAvgRatePerSlot(draft.structures);

      const res = await fetch('/api/crm/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project: {
            name: draft.name,
            location: draft.location || null,
            type: draft.type,
            status: draft.status,
            fy: draft.fy || null,
            rera_no: isReadyProjectType(draft.type)
              ? draft.rera_no.trim() || null
              : null,
            floors_per_wing: metaFloors,
            units_per_floor: metaUnits,
            base_rate: Number(draft.base_rate || 0) || null,
            min_rate: null,
            max_rate: null,
            parking_slots:
              parkingSlotsTotal > 0 ? parkingSlotsTotal : null,
            parking_rate:
              parkingSlotsTotal > 0
                ? Math.round(parkingAvg ?? 0)
                : null
          },
          wings,
          unitTypes,
          floorProvisions: draft.floorProvisions,
          members: draft.memberIds.map((id) => ({
            userId: id,
            role: 'Member'
          }))
        })
      });

      const json = (await res.json()) as { projectId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to create project');

      router.push('/crm/project');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  function goNext() {
    if (createStep === 0) {
      const parsed = step0Validation.validate();
      if (!parsed.success) {
        pageError('Fix the highlighted fields before continuing.');
        return;
      }
    }
    if (createStep === 1) {
      const parsed = step1FieldsValidation.validate();
      if (!parsed.success) {
        pageError('Fix the highlighted fields before continuing.');
        return;
      }
    }
    if (createStep === 3) {
      const parsed = step3Validation.validate();
      if (!parsed.success) {
        pageError('Fix the highlighted fields before continuing.');
        return;
      }
    }

    const err = validateCreateStep(createStep, draft, { existingProjects });
    if (err) {
      pageError(err);
      return;
    }
        if (createStep === 1) {
      setDraft((d) => {
        const defaultUnitType = firstUnitTypeFromCsv(d.unitTypesCsv);
        const provisions =
          d.floorProvisions.length > 0
            ? d.floorProvisions
            : buildDefaultFloorProvisions({
                structures: d.structures,
                floorsPerWingDefault: d.floors_per_wing,
                unitsPerFloorDefault: d.units_per_floor,
                baseRate: d.base_rate,
                defaultUnitType
              });
        return {
          ...d,
          floorProvisions: applyDefaultUnitTypeToFloorProvisions(
            provisions,
            defaultUnitType
          )
        };
      });
    }
    setCreateStep((s) => Math.min(s + 1, lastWizardStep));
  }

  function goBack() {
        setCreateStep((s) => Math.max(0, s - 1));
  }

  const mergedUnitTypes = useMemo(
    () => parseUnitTypesCsv(draft.unitTypesCsv),
    [draft.unitTypesCsv]
  );

  const createBlockedReason = useMemo(
    () => validateCreateDraft(draft, { existingProjects }),
    [draft, existingProjects]
  );

  const previewUnitTotal = useMemo(() => {
    if (draft.floorProvisions.length > 0) {
      return draft.floorProvisions.reduce(
        (sum, row) => sum + (row.unitConfigs?.length || 0),
        0
      );
    }
    return countProjectUnits(draft.structures);
  }, [draft.floorProvisions, draft.structures]);

  const parkingSlots = useMemo(
    () => projectParkingTotal(draft.structures),
    [draft.structures]
  );
  const parkingValueInr = useMemo(
    () => projectParkingValueTotal(draft.structures),
    [draft.structures]
  );
  const parkingAvgRate = useMemo(
    () => projectParkingAvgRatePerSlot(draft.structures),
    [draft.structures]
  );
  const parkingReviewLine = useMemo(() => {
    if (parkingSlots <= 0) return '—';
    if (parkingValueInr <= 0) return `${parkingSlots} slots`;
    const avg = parkingAvgRate ?? 0;
    return `${parkingSlots} slots · avg ₹${avg.toLocaleString(
      'en-IN'
    )}/slot · ₹${parkingValueInr.toLocaleString('en-IN')} total`;
  }, [parkingAvgRate, parkingSlots, parkingValueInr]);

  const step0Values = useMemo(
    () => ({
      name: draft.name,
      location: draft.location
    }),
    [draft.name, draft.location]
  );
  const step1FieldValues = useMemo(
    () => ({ unitTypesCsv: draft.unitTypesCsv }),
    [draft.unitTypesCsv]
  );
  const step3Values = useMemo(
    () => ({
      base_rate: draft.base_rate
    }),
    [draft.base_rate]
  );

  const step0Schema = useMemo(
    () => createProjectStep0SchemaWithExisting(existingProjects),
    [existingProjects]
  );

  const step0Validation = useFieldValidation(step0Schema, step0Values);
  const step1FieldsValidation = useFieldValidation(
    createProjectStep1FieldsSchema,
    step1FieldValues
  );
  const step3Validation = useFieldValidation(createProjectStep3Schema, step3Values);

  if (loading || !canCreateProject) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : 'Redirecting…'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Card className="flex flex-col overflow-hidden">
        <div className="border-b px-6 pb-3 pt-5">

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BackButton href="/crm/project" label="Projects" />
              <h1 className="text-lg font-semibold tracking-tight">
                Create project
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Step {createStep + 1} of {WIZARD_STEPS.length}:{' '}
              {WIZARD_STEPS[createStep]}
            </p>
          </div>
        </div>

        <div className="border-b px-4 py-3 sm:px-6">
          <WizardStepper
            steps={projectWizardSteps}
            currentIndex={createStep}
            maxReachableIndex={createStep}
            ariaLabel="Create project progress"
            onSelectStep={(idx) => {
              if (idx <= createStep) setCreateStep(idx);
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">

          {createStep === 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <TextInputField
                className="col-span-2"
                label="Project name"
                required
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                  step0Validation.touch('name');
                }}
                onBlur={() => step0Validation.touch('name')}
                error={step0Validation.fieldError('name')}
                placeholder="e.g. Sunrise Residency"
              />
              <ProjectLocationField
                className="col-span-2"
                required
                value={draft.location}
                onChange={(location) => {
                  setDraft((d) => ({ ...d, location }));
                  step0Validation.touch('location');
                }}
                onBlur={() => step0Validation.touch('location')}
                error={step0Validation.fieldError('location')}
              />
              <div>
                <Label>Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      type: v as CreateProjectDraft['type'],
                      fy: coerceProjectFy(v, d.fy),
                      rera_no: isReadyProjectType(v) ? d.rera_no : ''
                    }))
                  }
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Redevelopment">Redevelopment</SelectItem>
                    <SelectItem value="Greenfield">Greenfield</SelectItem>
                    <SelectItem value="Mixed Use">Mixed Use</SelectItem>
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Ready">Ready</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      status: v as CreateProjectDraft['status']
                    }))
                  }
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ProjectFySelect
                label="FY"
                projectType={draft.type}
                value={draft.fy}
                onValueChange={(fy) => setDraft((d) => ({ ...d, fy }))}
              />
              {isReadyProjectType(draft.type) ? (
                <TextInputField
                  label="RERA No."
                  required
                  value={draft.rera_no}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rera_no: e.target.value }))
                  }
                  placeholder="e.g. P52100012345"
                />
              ) : null}
            </div>
          ) : null}

          {createStep === 1 ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-800">
                Set structure names, kinds, area, and floors here. Unit counts,
                types, carpet/BUA/RERA, outdoor areas, rates, floor-rise, PLC,
                and parking per unit are set floor-wise on the next step.
              </div>
              <InventoryConfigSummary
                draftName={draft.name}
                projectType={draft.type}
                structures={draft.structures}
                floorsPerWing={draft.floors_per_wing}
                unitsPerFloor={draft.units_per_floor}
                onFloorsPerWingChange={(n) =>
                  setDraft((d) => ({ ...d, floors_per_wing: n }))
                }
                onUnitsPerFloorChange={(n) =>
                  setDraft((d) => ({ ...d, units_per_floor: n }))
                }
              />
              <TextInputField
                label="Unit types (comma-separated)"
                required
                value={draft.unitTypesCsv}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, unitTypesCsv: e.target.value }));
                  step1FieldsValidation.touch('unitTypesCsv');
                }}
                onBlur={() => step1FieldsValidation.touch('unitTypesCsv')}
                error={step1FieldsValidation.fieldError('unitTypesCsv')}
                placeholder="1BHK,2BHK,3BHK"
              />
              <p className="text-[10px] text-muted-foreground">
                Required. Used as dropdown options when configuring each unit
                on the floor step.
              </p>
              <div className="font-semibold text-slate-900">Structure tree</div>
              <StructureTreeFields
                nodes={draft.structures}
                onNodesChange={(structures) =>
                  setDraft((d) => ({ ...d, structures }))
                }
                defaultFloors={draft.floors_per_wing || 7}
                defaultUnitsPerFloor={draft.units_per_floor || 4}
              />
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-[11px] text-emerald-900">
                <span className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                  <span>
                    <span className="text-emerald-700">Structure leaves</span>{' '}
                    <strong>
                      {
                        getStructureLeaves(normalizeStructures(draft.structures))
                          .length
                      }
                    </strong>
                  </span>
                  <span>
                    <span className="text-emerald-700">Parking</span>{' '}
                    <strong>{parkingSlots}</strong>
                    {parkingSlots > 0 && parkingValueInr > 0 && parkingAvgRate != null ? (
                      <>
                        {' · avg '}
                        <strong>
                          ₹{parkingAvgRate.toLocaleString('en-IN')}
                        </strong>
                        /slot ·{' '}
                        <strong>
                          ₹{parkingValueInr.toLocaleString('en-IN')}
                        </strong>{' '}
                        total
                      </>
                    ) : null}
                  </span>
                  <span>
                    <span className="text-emerald-700">Total units</span>{' '}
                    <strong>{countProjectUnits(draft.structures)}</strong>
                  </span>
                  <span>
                    <span className="text-emerald-700">Default floors</span>{' '}
                    <strong>{draft.floors_per_wing}</strong>
                  </span>
                </span>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900">
                <span className="font-semibold">Preview: </span>
                {wingsFromDraft(draft).length} structure path
                {wingsFromDraft(draft).length !== 1 ? 's' : ''} · ≈{' '}
                <strong>{previewUnitTotal}</strong> units (before floor
                overrides)
              </div>
            </div>
          ) : null}

          {createStep === 2 ? (
            <FloorConfigureStep
              structures={draft.structures}
              floorProvisions={draft.floorProvisions}
              onFloorProvisionsChange={(floorProvisions) =>
                setDraft((d) => ({ ...d, floorProvisions }))
              }
              unitTypes={mergedUnitTypes}
              baseRate={draft.base_rate}
              onAutoFill={() =>
                setDraft((d) => {
                  const defaultUnitType = firstUnitTypeFromCsv(d.unitTypesCsv);
                  return {
                    ...d,
                    floorProvisions: buildDefaultFloorProvisions({
                      structures: d.structures,
                      floorsPerWingDefault: d.floors_per_wing,
                      unitsPerFloorDefault: d.units_per_floor,
                      baseRate: d.base_rate,
                      defaultUnitType
                    })
                  };
                })
              }
            />
          ) : null}

          {createStep === 3 ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                Base rate seeds new floor rows and default ₹/sq.ft per unit.
                Carpet/BUA, floor-rise, PLC, and bundled parking are configured
                on the Inventory floor step (previous step).
              </div>
              <TextInputField
                className="col-span-2"
                label="Base rate (₹/sq.ft)"
                type="number"
                min={0}
                value={String(draft.base_rate)}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    base_rate: Number(e.target.value) || 0
                  }));
                  step3Validation.touch('base_rate');
                }}
                onBlur={() => step3Validation.touch('base_rate')}
                error={step3Validation.fieldError('base_rate')}
              />
            </div>
          ) : null}

          {createStep === 4 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Assign members (optional)
                  </div>
                  <div className="text-xs text-gray-500">
                    Selected: {draft.memberIds.length}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearAllMembers}
                  disabled={draft.memberIds.length === 0}
                >
                  Clear
                </Button>
              </div>

              <div>
                <Label>Add user</Label>
                <SearchableSelect
                  key={addMemberPickerKey}
                  value=""
                  onValueChange={(label) => {
                    const user = profiles.find(
                      (p) => profileOptionLabel(p) === label
                    );
                    if (user && !draft.memberIds.includes(user.id)) {
                      setDraft((d) => ({
                        ...d,
                        memberIds: [...d.memberIds, user.id]
                      }));
                      setAddMemberPickerKey((k) => k + 1);
                    }
                  }}
                  options={availableMemberProfiles.map(profileOptionLabel)}
                  placeholder={
                    profiles.length === 0
                      ? 'No users available'
                      : availableMemberProfiles.length === 0
                        ? 'All users assigned'
                        : 'Search and select user…'
                  }
                  searchPlaceholder="Search by name or role…"
                  className={formControlFieldGapClass}
                  disabled={
                    profiles.length === 0 || availableMemberProfiles.length === 0
                  }
                />
              </div>

              {draft.memberIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.memberIds.map((id) => {
                    const profile = profiles.find((p) => p.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => removeMemberChip(id)}
                        className="rounded-lg border border-ds-gray-200 bg-white px-3 py-1 text-xs text-ds-gray-700 hover:bg-ds-gray-50"
                        title="Remove"
                      >
                        {profile ? profileOptionLabel(profile) : 'Unnamed user'} ×
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {createStep === 5 ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">
                Review & confirm
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Project name', draft.name || '—'],
                  ['Location', draft.location || '—'],
                  ['Type', draft.type],
                  ['Status', draft.status],
                  ['FY', draft.fy || '—'],
                  ...(isReadyProjectType(draft.type)
                    ? ([['RERA', draft.rera_no || '—']] as const)
                    : []),
                  [
                    'Structure paths',
                    wingsFromDraft(draft).join(' · ') || '—'
                  ],
                  [
                    'Floors / units (defaults)',
                    `${draft.floors_per_wing} / ${draft.units_per_floor}`
                  ],
                  ['Units to seed', String(previewUnitTotal)],
                  ['Parking (slots / value)', parkingReviewLine],
                  [
                    'Floor provision rows',
                    String(draft.floorProvisions.length)
                  ],
                  ['Base rate (₹/sq.ft)', String(draft.base_rate)],
                  ['Unit types', mergedUnitTypes.join(', ') || '—'],
                  ['Members', `${draft.memberIds.length} selected`]
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-slate-50 px-3 py-2">
                    <div className="text-[10px] text-slate-400">{k}</div>
                    <div className="font-medium text-slate-900">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (createStep === 0) {
                setDraft(resetDraft());
                router.push('/crm/project');
              } else goBack();
            }}
            disabled={creating}
          >
            {createStep === 0 ? 'Cancel' : '← Back'}
          </Button>
          <div className="flex gap-2">
            {createStep < lastWizardStep ? (
              <Button type="button" onClick={goNext} disabled={creating}>
                Next →
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void createProject()}
                disabled={
                  creating ||
                  !draft.name.trim() ||
                  !draft.location.trim() ||
                  Boolean(createBlockedReason)
                }
              >
                {creating ? 'Creating…' : 'Create project'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
