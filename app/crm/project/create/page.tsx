'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../../_components/active-project-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DEFAULT_UNIT_TYPES,
  buildDefaultFloorProvisions,
  countProjectUnits,
  normalizeStructures,
  getStructureLeaves,
  projectParkingTotal
} from '../project-structure-utils';
import {
  FloorConfigureStep,
  InventoryConfigSummary,
  StructureTreeFields
} from '../project-create-inventory';
import {
  WIZARD_STEPS,
  type CreateProjectDraft,
  wingsFromDraft,
  validateCreateStep,
  createInitialDraft,
  resetDraft
} from '../project-create-shared';

type ProfileRow = { id: string; name: string | null; role: string };

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { setActiveProjectId } = useActiveProjectContext();

  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createStep, setCreateStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [draft, setDraft] = useState<CreateProjectDraft>(() =>
    createInitialDraft()
  );
  const [error, setError] = useState('');

  const canCreateProject = myProfile?.role === 'Super Admin';
  const lastWizardStep = WIZARD_STEPS.length - 1;

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
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const filteredProfiles = profiles.filter((p) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const selectVisibleMembers = () => {
    const ids = filteredProfiles.map((p) => p.id);
    setDraft((d) => ({
      ...d,
      memberIds: Array.from(new Set([...d.memberIds, ...ids]))
    }));
  };

  const clearAllMembers = () => setDraft((d) => ({ ...d, memberIds: [] }));

  const removeMemberChip = (id: string) =>
    setDraft((d) => ({ ...d, memberIds: d.memberIds.filter((x) => x !== id) }));

  async function createProject() {
    setCreating(true);
    setError('');
    try {
      const wings = wingsFromDraft(draft);
      const fromCsv = draft.unitTypesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const fromFloors = new Set<string>();
      for (const row of draft.floorProvisions) {
        for (const u of row.unitConfigs || []) {
          const t = (u.type || '').trim();
          if (t) fromFloors.add(t);
        }
      }
      const unitTypes = Array.from(
        new Set([...DEFAULT_UNIT_TYPES, ...fromCsv, ...fromFloors])
      );

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
            rera_no: draft.rera_no || null,
            floors_per_wing: metaFloors,
            units_per_floor: metaUnits,
            base_rate: Number(draft.base_rate || 0) || null,
            min_rate: Number(draft.min_rate || 0) || null,
            max_rate: Number(draft.max_rate || 0) || null
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

      if (json.projectId) setActiveProjectId(json.projectId);
      router.push('/crm/project');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  function goNext() {
    const err = validateCreateStep(createStep, draft);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    if (createStep === 1) {
      setDraft((d) => ({
        ...d,
        floorProvisions:
          d.floorProvisions.length > 0
            ? d.floorProvisions
            : buildDefaultFloorProvisions({
              structures: d.structures,
              floorsPerWingDefault: d.floors_per_wing,
              unitsPerFloorDefault: d.units_per_floor,
              baseRate: d.base_rate
            })
      }));
    }
    setCreateStep((s) => Math.min(s + 1, lastWizardStep));
  }

  function goBack() {
    setError('');
    setCreateStep((s) => Math.max(0, s - 1));
  }

  const mergedUnitTypes = useMemo(() => {
    const fromCsv = draft.unitTypesCsv
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return Array.from(new Set([...DEFAULT_UNIT_TYPES, ...fromCsv]));
  }, [draft.unitTypesCsv]);

  const previewUnitTotal = useMemo(() => {
    if (draft.floorProvisions.length > 0) {
      return draft.floorProvisions.reduce(
        (sum, row) => sum + (row.unitConfigs?.length || 0),
        0
      );
    }
    return countProjectUnits(draft.structures);
  }, [draft.floorProvisions, draft.structures]);

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
              <Button variant="outline" size="sm" asChild>
                <Link href="/crm/project" className="gap-2">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
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

        <div className="flex items-center gap-0 border-b px-4 py-3 sm:px-6">
          {WIZARD_STEPS.map((label, i) => (
            <Fragment key={label}>
              <button
                type="button"
                onClick={() => {
                  if (i <= createStep) {
                    setError('');
                    setCreateStep(i);
                  }
                }}
                disabled={i > createStep}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md p-1 transition-colors',
                  i <= createStep
                    ? 'cursor-pointer text-blue-600 hover:bg-blue-50/80'
                    : 'cursor-not-allowed opacity-50'
                )}
              >
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                    i < createStep && 'bg-emerald-500',
                    i === createStep && 'bg-blue-500',
                    i > createStep && 'bg-slate-200 text-slate-500'
                  )}
                >
                  {i < createStep ? '✓' : i + 1}
                </div>
                <span className="hidden text-center text-[9px] font-medium leading-tight sm:block">
                  {label}
                </span>
              </button>
              {i < lastWizardStep ? (
                <div
                  className={cn(
                    'mb-5 hidden h-0.5 min-w-[6px] shrink sm:block sm:flex-1',
                    i < createStep ? 'bg-emerald-400' : 'bg-slate-200'
                  )}
                  aria-hidden
                />
              ) : null}
            </Fragment>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {createStep === 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Project name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="e.g. Sunrise Residency"
                />
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input
                  value={draft.location}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, location: e.target.value }))
                  }
                  placeholder="e.g. Pune, Maharashtra"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      type: e.target.value as CreateProjectDraft['type']
                    }))
                  }
                  className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm"
                >
                  <option>Redevelopment</option>
                  <option>Greenfield</option>
                  <option>Mixed Use</option>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      status: e.target.value as CreateProjectDraft['status']
                    }))
                  }
                  className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm"
                >
                  <option>Active</option>
                  <option>Planning</option>
                  <option>On Hold</option>
                </select>
              </div>
              <div>
                <Label>FY</Label>
                <Input
                  value={draft.fy}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, fy: e.target.value }))
                  }
                  placeholder="2026-27"
                />
              </div>
              <div>
                <Label>RERA No.</Label>
                <Input
                  value={draft.rera_no}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rera_no: e.target.value }))
                  }
                  placeholder="e.g. P52100012345"
                />
              </div>
            </div>
          ) : null}

          {createStep === 1 ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-800">
                Set structure names, kinds, area, and floors here. Unit counts
                and types are refined on the next step (floor-wise).
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
              <div>
                <Label>Unit types (comma-separated)</Label>
                <Input
                  className="mt-1"
                  value={draft.unitTypesCsv}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, unitTypesCsv: e.target.value }))
                  }
                  placeholder="1BHK,2BHK,3BHK"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Used as dropdown options when configuring each unit on the
                  floor step.
                </p>
              </div>
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
                    <strong>{projectParkingTotal(draft.structures)}</strong>
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
                setDraft((d) => ({
                  ...d,
                  floorProvisions: buildDefaultFloorProvisions({
                    structures: d.structures,
                    floorsPerWingDefault: d.floors_per_wing,
                    unitsPerFloorDefault: d.units_per_floor,
                    baseRate: d.base_rate
                  })
                }))
              }
            />
          ) : null}

          {createStep === 3 ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                Rates are used as defaults when seeding units. Individual units
                can be adjusted later.
              </div>
              <div className="col-span-2">
                <Label>Base rate (₹/sq.ft)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.base_rate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      base_rate: Number(e.target.value)
                    }))
                  }
                />
              </div>
              <div>
                <Label>Min rate</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.min_rate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      min_rate: Number(e.target.value)
                    }))
                  }
                />
              </div>
              <div>
                <Label>Max rate</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.max_rate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      max_rate: Number(e.target.value)
                    }))
                  }
                />
              </div>
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={selectVisibleMembers}
                    disabled={filteredProfiles.length === 0}
                  >
                    Select visible
                  </Button>
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

              <div>
                <Label>Search users</Label>
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name, role, or id…"
                />
              </div>

              {draft.memberIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.memberIds.slice(0, 8).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => removeMemberChip(id)}
                      className="border bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      title="Remove"
                    >
                      {profiles.find((p) => p.id === id)?.name ?? id} ×
                    </button>
                  ))}
                  {draft.memberIds.length > 8 ? (
                    <div className="border bg-gray-50 px-3 py-1 text-xs text-gray-500">
                      +{draft.memberIds.length - 8} more
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid max-h-[280px] grid-cols-1 gap-2 overflow-auto border bg-gray-50 p-2 sm:grid-cols-2">
                {filteredProfiles.map((p) => {
                  const checked = draft.memberIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 border px-3 py-2 text-sm transition-colors ${checked
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            memberIds: checked
                              ? d.memberIds.filter((x) => x !== p.id)
                              : [...d.memberIds, p.id]
                          }))
                        }
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">
                          {p.name || 'Unnamed user'}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {p.role} · {p.id}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {profiles.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">
                    No users found.
                  </div>
                ) : null}
                {profiles.length > 0 && filteredProfiles.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">
                    No users match your search.
                  </div>
                ) : null}
              </div>
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
                  ['RERA', draft.rera_no || '—'],
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
                  [
                    'Rates (base / min / max)',
                    `${draft.base_rate} / ${draft.min_rate} / ${draft.max_rate}`
                  ],
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
                disabled={creating || !draft.name.trim()}
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
