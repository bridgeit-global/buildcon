'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Building2,
  ClipboardCheck,
  FileText,
  IndianRupee,
  LayoutGrid,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CrmFormSkeleton } from '../../_components/crm-skeletons';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSearchableSelect } from '@/components/ui/multi-searchable-select';
import { FormFieldError } from '@/components/ui/form-field-error';
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
  floorProvisionsParkingTotal,
  normalizeStructures,
  getStructureLeaves,
  projectParkingAvgRatePerSlot,
  projectParkingTotal,
  projectParkingValueTotal
} from '../project-structure-utils';
import {
  FloorConfigureStep,
  StructureTreeFields
} from '../project-create-inventory';
import {
  CREATE_PROJECT_WIZARD_STEPS,
  type CreateProjectDraft,
  createProjectStep0SchemaWithExisting,
  createProjectStep1FieldsSchema,
  wingsFromDraft,
  validateCreateStep,
  validateCreateDraft,
  parseUnitTypesCsv,
  parseUnitCategoriesCsv,
  firstUnitTypeFromCsv,
  firstUnitCategoryFromCsv,
  applyDefaultUnitTypeToFloorProvisions,
  applyDefaultUnitCategoryToFloorProvisions,
  unitTypesFromDraft,
  createInitialDraft,
  resetDraft
} from '../project-create-shared';
import { ProjectExcelImportCard } from '../project-excel-import-card';
import BackButton from '@/components/buttons/back-button';
import { canCreateProject as userCanCreateProject } from '@/lib/profile-roles';
import { coerceProjectFy } from '@/lib/project/project-fy';
import { ProjectFySelect } from '../project-fy-select';
import { useMasterLookup } from '@/lib/master/use-master-lookup';
import { useCrmProjectsStore } from '@/store/crm-projects-store';

type ProfileRow = { id: string; name: string | null; role: string };
type ProjectNameRow = { id: string; name: string };

const STEP_BASICS = 0;
const STEP_INVENTORY = 1;
const STEP_UNITS = 2;
const STEP_REVIEW = 3;

function profileOptionLabel(p: ProfileRow): string {
  return `${p.name || 'Unnamed user'} (${p.role})`;
}

function StepSectionHeading(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ds-primary-50 text-ds-primary-600">
        {props.icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}

function ReviewGroup(props: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {props.items.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-[10px] text-ds-gray-400">{k}</dt>
            <dd className="text-sm font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const upsertProject = useCrmProjectsStore((s) => s.upsertProject);

  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [existingProjects, setExistingProjects] = useState<ProjectNameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createStep, setCreateStep] = useState(STEP_BASICS);
  const [maxVisitedStep, setMaxVisitedStep] = useState(STEP_BASICS);
  const [creating, setCreating] = useState(false);
  const [addMemberPickerKey, setAddMemberPickerKey] = useState(0);
  const [draft, setDraft] = useState<CreateProjectDraft>(() =>
    createInitialDraft()
  );

  const canCreateProject = userCanCreateProject(myProfile?.role);
  const { activeNames: masterUnitTypes } = useMasterLookup('unit_type');
  const { activeNames: masterUnitCategories } = useMasterLookup('unit_category');
  const lastWizardStep = CREATE_PROJECT_WIZARD_STEPS.length - 1;
  const projectWizardSteps = useMemo(
    () =>
      CREATE_PROJECT_WIZARD_STEPS.map((step) => ({
        id: step.id,
        label: step.label,
        description: step.description
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
      if (!userCanCreateProject(row?.role)) {
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

      const parkingSlotsTotal = Math.max(
        projectParkingTotal(draft.structures),
        floorProvisionsParkingTotal(draft.floorProvisions)
      );
      const parkingAvg = projectParkingAvgRatePerSlot(draft.structures);

      const projectPayload = {
        name: draft.name.trim(),
        location: draft.location || null,
        type: draft.type,
        status: draft.status,
        fy: draft.fy || null,
        rera_no: draft.rera_no.trim() || null,
        floors_per_wing: metaFloors,
        units_per_floor: metaUnits,
        base_rate: Number(draft.base_rate || 0) || null,
        min_rate: null,
        max_rate: null,
        parking_slots: parkingSlotsTotal > 0 ? parkingSlotsTotal : null,
        parking_rate:
          parkingSlotsTotal > 0 ? Math.round(parkingAvg ?? 0) : null
      };

      const res = await fetch('/api/crm/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project: projectPayload,
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

      if (json.projectId) {
        // Keep the shared project-picker store in sync so the new project
        // shows up immediately across the CRM without a full layout reload.
        upsertProject({ id: json.projectId, ...projectPayload });
      }

      router.push('/crm/project');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  function seedFloorProvisionsFromInventory() {
    setDraft((d) => {
      const defaultUnitType = firstUnitTypeFromCsv(d.unitTypesCsv);
      const defaultUnitCategory = firstUnitCategoryFromCsv(d.unitCategoriesCsv);
      const provisions =
        d.floorProvisions.length > 0
          ? d.floorProvisions
          : buildDefaultFloorProvisions({
              structures: d.structures,
              floorsPerWingDefault: d.floors_per_wing,
              unitsPerFloorDefault: d.units_per_floor,
              baseRate: d.base_rate,
              defaultUnitType,
              defaultUnitCategory
            });
      const withTypes = applyDefaultUnitTypeToFloorProvisions(
        provisions,
        defaultUnitType
      );
      return {
        ...d,
        floorProvisions: applyDefaultUnitCategoryToFloorProvisions(
          withTypes,
          defaultUnitCategory
        )
      };
    });
  }

  /** Validates the given step; shows a toast and returns false when blocked. */
  function validateStepWithFeedback(step: number): boolean {
    if (step === STEP_BASICS && !step0Validation.validate().success) {
      pageError('Fix the highlighted fields before continuing.');
      return false;
    }
    if (step === STEP_INVENTORY && !step1FieldsValidation.validate().success) {
      pageError('Fix the highlighted fields before continuing.');
      return false;
    }
    const err = validateCreateStep(step, draft, { existingProjects });
    if (err) {
      pageError(err);
      return false;
    }
    return true;
  }

  function goToStep(target: number) {
    const next = Math.max(0, Math.min(target, lastWizardStep));
    if (next === createStep) return;
    if (next > createStep) {
      // Validate every step being skipped over so bad data can't slip through.
      for (let s = createStep; s < next; s++) {
        if (!validateStepWithFeedback(s)) return;
        if (s === STEP_INVENTORY) seedFloorProvisionsFromInventory();
      }
    }
    setCreateStep(next);
    setMaxVisitedStep((m) => Math.max(m, next));
  }

  function goNext() {
    goToStep(createStep + 1);
  }

  function goBack() {
    setCreateStep((s) => Math.max(0, s - 1));
  }

  const mergedUnitTypes = useMemo(
    () => parseUnitTypesCsv(draft.unitTypesCsv),
    [draft.unitTypesCsv]
  );

  const mergedUnitCategories = useMemo(
    () => parseUnitCategoriesCsv(draft.unitCategoriesCsv),
    [draft.unitCategoriesCsv]
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

  const structureFloorsTotal = useMemo(
    () => getStructureLeaves(normalizeStructures(draft.structures)).length,
    [draft.structures]
  );
  const parkingSlots = useMemo(
    () =>
      Math.max(
        projectParkingTotal(draft.structures),
        floorProvisionsParkingTotal(draft.floorProvisions)
      ),
    [draft.structures, draft.floorProvisions]
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
      location: draft.location,
      base_rate: draft.base_rate
    }),
    [draft.name, draft.location, draft.base_rate]
  );
  const step1FieldValues = useMemo(
    () => ({ unitTypesCsv: draft.unitTypesCsv }),
    [draft.unitTypesCsv]
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

  if (loading || !canCreateProject) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {loading ? (
          <CrmFormSkeleton fields={8} />
        ) : (
          <div className="text-sm text-muted-foreground">Redirecting…</div>
        )}
      </div>
    );
  }

  const currentStepDef = CREATE_PROJECT_WIZARD_STEPS[createStep];

  return (
    <div>
      <Card className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-center gap-2">
            <BackButton href="/crm/project" label="Projects" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Create project
              </h1>
              <p className="text-xs text-muted-foreground">
                {currentStepDef.description}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-ds-primary-50 px-3 py-1 text-xs font-semibold text-ds-primary-700">
            Step {createStep + 1} of {CREATE_PROJECT_WIZARD_STEPS.length}
          </span>
        </div>

        <div className="border-b px-4 py-3 sm:px-6">
          <WizardStepper
            steps={projectWizardSteps}
            currentIndex={createStep}
            maxReachableIndex={maxVisitedStep}
            ariaLabel="Create project progress"
            onSelectStep={(idx) => goToStep(idx)}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {createStep <= STEP_INVENTORY ? (
              <div className="mb-4">
                <ProjectExcelImportCard
                  existingProjects={existingProjects}
                  onImported={(patch, _unitCount, meta) => {
                    setDraft((d) => ({ ...d, ...patch }));
                    if (meta.nameConflict) {
                      // Keep the user on Basics so the duplicate-name error is visible
                      // instead of silently advancing with an unusable project name.
                      step0Validation.touch('name');
                      setCreateStep(STEP_BASICS);
                      setMaxVisitedStep((m) => Math.max(m, STEP_BASICS));
                      return;
                    }
                    setCreateStep(STEP_INVENTORY);
                    setMaxVisitedStep((m) => Math.max(m, STEP_INVENTORY));
                  }}
                />
              </div>
            ) : null}

            {createStep === STEP_BASICS ? (
              <div className="flex flex-col gap-6">
                <StepSectionHeading
                  icon={<FileText className="size-4" />}
                  title="Project details"
                  description="Identity, location and compliance basics for the new project."
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInputField
                    className="sm:col-span-2"
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
                    className="sm:col-span-2"
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
                          fy: coerceProjectFy(v, d.fy)
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Redevelopment">
                          Redevelopment
                        </SelectItem>
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
                  <TextInputField
                    label="RERA No."
                    value={draft.rera_no}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, rera_no: e.target.value }))
                    }
                    placeholder="e.g. P52100012345"
                  />
                </div>

                <div className="border-t pt-5">
                  <StepSectionHeading
                    icon={<IndianRupee className="size-4" />}
                    title="Default pricing"
                    description="Base rate seeds new floor rows and the default ₹/sq.ft per unit. You can fine-tune each unit in Unit Setup."
                  />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextInputField
                      label="Base rate (₹/sq.ft)"
                      type="number"
                      min={0}
                      value={String(draft.base_rate)}
                      onChange={(e) => {
                        setDraft((d) => ({
                          ...d,
                          base_rate: Number(e.target.value) || 0
                        }));
                        step0Validation.touch('base_rate');
                      }}
                      onBlur={() => step0Validation.touch('base_rate')}
                      error={step0Validation.fieldError('base_rate')}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {createStep === STEP_INVENTORY ? (
              <div className="flex flex-col gap-6">
                <StepSectionHeading
                  icon={<Building2 className="size-4" />}
                  title="Buildings, wings & floors"
                  description="Define Building → Wing → Floor and set how many units each floor has. Unit type, area, rates and parking are configured in Unit Setup."
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className={formControlFieldGapClass}>
                    <Label>
                      Unit types <span className="text-ds-error-600">*</span>
                    </Label>
                    <MultiSearchableSelect
                      values={mergedUnitTypes}
                      onValuesChange={(next) => {
                        setDraft((d) => ({
                          ...d,
                          unitTypesCsv: next.join(',')
                        }));
                        step1FieldsValidation.touch('unitTypesCsv');
                      }}
                      options={masterUnitTypes}
                      allowCustom
                      placeholder="Select or add unit types…"
                      searchPlaceholder="Search or type to add (e.g. 1BHK)…"
                    />
                    <FormFieldError
                      message={step1FieldsValidation.fieldError('unitTypesCsv')}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Required. Shown as options when configuring each unit in
                      Unit Setup.
                    </p>
                  </div>
                  <div className={formControlFieldGapClass}>
                    <Label>Unit categories</Label>
                    <MultiSearchableSelect
                      values={mergedUnitCategories}
                      onValuesChange={(next) => {
                        setDraft((d) => ({
                          ...d,
                          unitCategoriesCsv: next.join(',')
                        }));
                      }}
                      options={masterUnitCategories}
                      allowCustom
                      placeholder="Select or add unit categories…"
                      searchPlaceholder="Search or type to add (e.g. Residential)…"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Optional. The first selected category is the default for
                      new units.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-foreground">
                    Structure tree
                  </div>
                  <StructureTreeFields
                    nodes={draft.structures}
                    onNodesChange={(structures) =>
                      setDraft((d) => ({ ...d, structures }))
                    }
                    defaultFloors={draft.floors_per_wing || 7}
                    defaultUnitsPerFloor={draft.units_per_floor || 4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['Buildings', String(normalizeStructures(draft.structures).length)],
                      ['Wings', String(wingsFromDraft(draft).length)],
                      ['Floors', String(structureFloorsTotal)],
                      ['Units', String(countProjectUnits(draft.structures))]
                    ] as Array<[string, string]>
                  ).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-lg border border-border bg-muted px-3 py-2"
                    >
                      <div className="text-[10px] text-muted-foreground">{k}</div>
                      <div className="text-sm font-bold text-foreground">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {createStep === STEP_UNITS ? (
              <div className="flex flex-col gap-6">
                <StepSectionHeading
                  icon={<LayoutGrid className="size-4" />}
                  title="Unit setup"
                  description="Configure every unit per floor: type, category, carpet/BUA/RERA areas, rates, floor-rise, PLC and bundled parking."
                />
                <FloorConfigureStep
                  structures={draft.structures}
                  floorProvisions={draft.floorProvisions}
                  onFloorProvisionsChange={(floorProvisions) =>
                    setDraft((d) => ({ ...d, floorProvisions }))
                  }
                  unitTypes={mergedUnitTypes}
                  unitCategories={mergedUnitCategories}
                  baseRate={draft.base_rate}
                  onAutoFill={() =>
                    setDraft((d) => {
                      const defaultUnitType = firstUnitTypeFromCsv(
                        d.unitTypesCsv
                      );
                      const defaultUnitCategory = firstUnitCategoryFromCsv(
                        d.unitCategoriesCsv
                      );
                      return {
                        ...d,
                        floorProvisions: buildDefaultFloorProvisions({
                          structures: d.structures,
                          floorsPerWingDefault: d.floors_per_wing,
                          unitsPerFloorDefault: d.units_per_floor,
                          baseRate: d.base_rate,
                          defaultUnitType,
                          defaultUnitCategory
                        })
                      };
                    })
                  }
                />
              </div>
            ) : null}

            {createStep === STEP_REVIEW ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <StepSectionHeading
                    icon={<Users className="size-4" />}
                    title="Assign members (optional)"
                    description="Give teammates access to this project. You can also do this later from project settings."
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                          profiles.length === 0 ||
                          availableMemberProfiles.length === 0
                        }
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2 sm:justify-end">
                      <div className="text-xs text-muted-foreground">
                        Selected: {draft.memberIds.length}
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
                            className="rounded-lg border border-ds-gray-200 bg-card px-3 py-2 text-xs text-ds-gray-700 hover:bg-ds-gray-50"
                            title="Remove"
                          >
                            {profile
                              ? profileOptionLabel(profile)
                              : 'Unnamed user'}{' '}
                            ×
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4 border-t pt-5">
                  <StepSectionHeading
                    icon={<ClipboardCheck className="size-4" />}
                    title="Review & confirm"
                    description="Double-check the setup below, then create the project."
                  />
                  {createBlockedReason ? (
                    <div className="rounded-lg border border-ds-warning-300 bg-ds-warning-50 px-3 py-2 text-xs text-ds-warning-800">
                      {createBlockedReason}
                    </div>
                  ) : null}
                  <ReviewGroup
                    title="Basic details"
                    items={[
                      ['Project name', draft.name || '—'],
                      ['Location', draft.location || '—'],
                      ['Type', draft.type],
                      ['Status', draft.status],
                      ['FY', draft.fy || '—'],
                      ['RERA', draft.rera_no || '—']
                    ]}
                  />
                  <ReviewGroup
                    title="Inventory"
                    items={[
                      [
                        'Structure paths',
                        wingsFromDraft(draft).join(' · ') || '—'
                      ],
                      [
                        'Floors / units (defaults)',
                        `${draft.floors_per_wing} / ${draft.units_per_floor}`
                      ],
                      ['Units to seed', String(previewUnitTotal)],
                      [
                        'Floor provision rows',
                        String(draft.floorProvisions.length)
                      ],
                      ['Unit types', mergedUnitTypes.join(', ') || '—'],
                      [
                        'Unit categories',
                        mergedUnitCategories.join(', ') || '—'
                      ]
                    ]}
                  />
                  <ReviewGroup
                    title="Pricing & parking"
                    items={[
                      ['Base rate (₹/sq.ft)', String(draft.base_rate)],
                      ['Parking (slots / value)', parkingReviewLine]
                    ]}
                  />
                  <ReviewGroup
                    title="Team"
                    items={[['Members', `${draft.memberIds.length} selected`]]}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-card px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (createStep === STEP_BASICS) {
                setDraft(resetDraft());
                router.push('/crm/project');
              } else goBack();
            }}
            disabled={creating}
          >
            {createStep === STEP_BASICS ? 'Cancel' : '← Back'}
          </Button>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {createStep < lastWizardStep
                ? `Next: ${CREATE_PROJECT_WIZARD_STEPS[createStep + 1].label}`
                : 'Ready to create'}
            </span>
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
