'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { CrmProjectCard } from '../_components/crm-project-card';
import type { CrmProjectListItem } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const WIZARD_STEPS = [
  'Basic Info',
  'Inventory',
  'Rates',
  'Users & Access',
  'Review'
] as const;

type CreateProjectDraft = {
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
  wingsCsv: string;
  unitTypesCsv: string;
  memberIds: string[];
};

function wingsFromDraft(d: CreateProjectDraft) {
  return d.wingsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateCreateStep(step: number, draft: CreateProjectDraft): string | null {
  if (step === 0) {
    if (!draft.name.trim()) return 'Project name is required.';
    return null;
  }
  if (step === 1) {
    if (wingsFromDraft(draft).length < 1) return 'Add at least one wing.';
    if (draft.floors_per_wing < 1) return 'Floors per wing must be at least 1.';
    if (draft.units_per_floor < 1) return 'Units per floor must be at least 1.';
    return null;
  }
  if (step === 2) {
    if (draft.base_rate < 0 || draft.min_rate < 0 || draft.max_rate < 0) {
      return 'Rates cannot be negative.';
    }
    return null;
  }
  return null;
}

type ProfileRow = { id: string; name: string | null; role: string };
type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

export default function ProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId, setActiveProjectId } = useActiveProjectContext();

  const [listItems, setListItems] = useState<CrmProjectListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [canCreateFromApi, setCanCreateFromApi] = useState(false);
  const [listQ, setListQ] = useState('');
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [open, setOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [draft, setDraft] = useState<CreateProjectDraft>({
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
    wingsCsv: 'A,B,C',
    unitTypesCsv: '1BHK,2BHK,3BHK',
    memberIds: []
  });

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

  const loadProjectsList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/crm/projects', { method: 'GET' });
      const json = (await res.json()) as {
        projects?: CrmProjectListItem[];
        canCreateProject?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Failed to load projects');
      setListItems(json.projects ?? []);
      setCanCreateFromApi(json.canCreateProject === true);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setListLoading(false);
    }
  }, []);

  async function loadBase() {
    setLoading(true);
    setError('');
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) setError(error.message);
      setMyProfile((data ?? null) as ProfileRow | null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadBase();
    void loadProjectsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1') {
      setOpen(true);
      router.replace('/crm/project', { scroll: false });
    }
  }, [router]);

  const filteredListItems = useMemo(() => {
    const query = listQ.trim().toLowerCase();
    if (!query) return listItems;
    return listItems.filter((p) => {
      const hay =
        `${p.name} ${p.location ?? ''} ${p.type} ${p.status} ${p.fy ?? ''} ${p.rera_no ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [listItems, listQ]);

  const canCreateProject = myProfile?.role === 'Super Admin';
  const canManageMembers = myProfile?.role === 'Super Admin' || myProjectRole === 'Manager';

  const lastWizardStep = WIZARD_STEPS.length - 1;

  function resetCreateWizard() {
    setCreateStep(0);
    setMemberSearch('');
  }

  async function loadProfilesIfCanManageMembers() {
    if (!canManageMembers) {
      setProfiles([]);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,role')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) setError(error.message);
    setProfiles((data ?? []) as ProfileRow[]);
  }

  useEffect(() => {
    void loadProfilesIfCanManageMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile?.role, myProjectRole, activeProjectId]);

  async function loadMembers() {
    if (!activeProjectId) {
      setMembers([]);
      setMyProjectRole(null);
      return;
    }
    const { data, error } = await supabase
      .from('project_members')
      .select('project_id,user_id,role,status,created_at')
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    setMembers((data ?? []) as ProjectMemberRow[]);

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const me = (data ?? []).find((m) => m.user_id === user.id);
      setMyProjectRole(me?.role ?? null);
    } else {
      setMyProjectRole(null);
    }
  }

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  async function createProject() {
    setCreating(true);
    setError('');
    try {
      const wings = draft.wingsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const unitTypes = draft.unitTypesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

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
            floors_per_wing: Number(draft.floors_per_wing || 1),
            units_per_floor: Number(draft.units_per_floor || 1),
            base_rate: Number(draft.base_rate || 0) || null,
            min_rate: Number(draft.min_rate || 0) || null,
            max_rate: Number(draft.max_rate || 0) || null
          },
          wings,
          unitTypes,
          members:
            canCreateProject
              ? draft.memberIds.map((id) => ({ userId: id, role: 'Member' }))
              : []
        })
      });

      const json = (await res.json()) as { projectId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to create project');

      setOpen(false);
      resetCreateWizard();
      await loadBase();
      await loadProjectsList();
      if (json.projectId) setActiveProjectId(json.projectId);
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
    setCreateStep((s) => Math.min(s + 1, lastWizardStep));
  }

  function goBack() {
    setError('');
    setCreateStep((s) => Math.max(0, s - 1));
  }

  const previewUnitTotal = useMemo(() => {
    const w = wingsFromDraft(draft).length;
    const f = Math.max(1, draft.floors_per_wing || 1);
    const u = Math.max(1, draft.units_per_floor || 1);
    return w * f * u;
  }, [draft]);

  async function upsertMember(userId: string, role: string, status: string) {
    if (!activeProjectId) return;
    setError('');
    const res = await fetch('/api/crm/admin/project-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId, userId, role, status })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error || 'Failed to update member');
    await loadMembers();
  }

  async function removeMember(userId: string) {
    if (!activeProjectId) return;
    setError('');
    const res = await fetch('/api/crm/admin/project-members', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId, userId })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error || 'Failed to remove member');
    await loadMembers();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-bold text-slate-800">Project</div>
            <div className="text-xs text-slate-400">
              Browse sites, pick the active project, invite members, and create new projects.
            </div>
          </div>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) resetCreateWizard();
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={!canCreateProject}>Create project</Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
              <div className="border-b px-6 pb-3 pt-5">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle>Create project</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Step {createStep + 1} of {WIZARD_STEPS.length}:{' '}
                    {WIZARD_STEPS[createStep]}
                  </p>
                </DialogHeader>
              </div>

              {/* Stepper */}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-700">
                      Set wings and floor density. Inventory rows are generated from these values when the project is created.
                    </div>
                    <div>
                      <Label>Floors per wing</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.floors_per_wing}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            floors_per_wing: Number(e.target.value)
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Units per floor</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.units_per_floor}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            units_per_floor: Number(e.target.value)
                          }))
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Wings (comma-separated)</Label>
                      <Input
                        value={draft.wingsCsv}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, wingsCsv: e.target.value }))
                        }
                        placeholder="A,B,C or Tower 1,Tower 2"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Unit types (comma-separated)</Label>
                      <Input
                        value={draft.unitTypesCsv}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, unitTypesCsv: e.target.value }))
                        }
                        placeholder="1BHK,2BHK,3BHK"
                      />
                    </div>
                    <div className="col-span-2 border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900">
                      <span className="font-semibold">Preview: </span>
                      {wingsFromDraft(draft).length} wings × {draft.floors_per_wing} floors ×{' '}
                      {draft.units_per_floor} units/floor ≈{' '}
                      <strong>{previewUnitTotal}</strong> units
                    </div>
                  </div>
                ) : null}

                {createStep === 2 ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2  border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                      Rates are used as defaults when seeding units. Individual units can be adjusted later.
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

                {createStep === 3 ? (
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

                {createStep === 4 ? (
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
                        ['Wings', wingsFromDraft(draft).join(', ') || '—'],
                        ['Floors / units per floor', `${draft.floors_per_wing} / ${draft.units_per_floor}`],
                        ['Approx. units', String(previewUnitTotal)],
                        [
                          'Rates (base / min / max)',
                          `${draft.base_rate} / ${draft.min_rate} / ${draft.max_rate}`
                        ],
                        ['Members', `${draft.memberIds.length} selected`]
                      ].map(([k, v]) => (
                        <div
                          key={String(k)}
                          className="bg-slate-50 px-3 py-2"
                        >
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
                    if (createStep === 0) setOpen(false);
                    else goBack();
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
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">All projects</div>
            <div className="text-xs text-gray-500">
              {listLoading
                ? 'Loading…'
                : `${filteredListItems.length} project${filteredListItems.length !== 1 ? 's' : ''} · click a card to open the dashboard`}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-[200px] md:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
                placeholder="Search projects…"
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void loadBase();
                void loadProjectsList();
              }}
              disabled={loading || listLoading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {listError ? (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {listError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredListItems.map((p) => (
            <CrmProjectCard
              key={p.id}
              project={p}
              activeProjectId={activeProjectId}
              onOpen={() => {
                setActiveProjectId(p.id);
                router.push('/crm/dashboard');
              }}
              onEdit={() => {
                setActiveProjectId(p.id);
                document.getElementById('project-members')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
              onInventory={() => {
                setActiveProjectId(p.id);
                router.push('/crm/inventory');
              }}
              onSettings={() => {
                setActiveProjectId(p.id);
                document.getElementById('project-members')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
            />
          ))}
        </div>

        {!listLoading && filteredListItems.length === 0 ? (
          <div className="border border-gray-100 bg-gray-50/80 p-6">
            <div className="text-sm font-semibold text-gray-900">No projects found</div>
            <div className="mt-1 text-sm text-gray-500">
              If you’re a normal user, ask an admin to add you to{' '}
              <code className="font-mono">project_members</code>. Super Admins can create a project from
              this page.
            </div>
          </div>
        ) : null}
      </Card>
      <Card id="project-members" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Project members
            </div>
            <div className="text-xs text-gray-500">
              {activeProjectId ? `${members.length} member(s)` : 'Select a project'}
            </div>
          </div>
        </div>

        {!canManageMembers ? (
          <div className="mt-3 text-sm text-gray-500">
            Only Super Admin or this project’s Manager can change project members.
          </div>
        ) : null}

        {activeProjectId ? (
          <div className="mt-3 overflow-auto">
            <table className="min-w-[820px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {['User', 'Role', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold border-b"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const prof = profiles.find((p) => p.id === m.user_id);
                  return (
                    <tr key={m.user_id} className="border-b">
                      <td className="px-3 py-2 text-gray-700">
                        <div className="font-semibold">
                          {prof?.name || m.user_id}
                        </div>
                        <div className="text-xs text-gray-500">{m.user_id}</div>
                      </td>
                      <td className="px-3 py-2">
                        {canManageMembers ? (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              upsertMember(m.user_id, e.target.value, m.status)
                            }
                            className="border border-input bg-background px-2 py-1 text-sm"
                          >
                            {['Member', 'Manager'].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          m.role
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canManageMembers ? (
                          <select
                            value={m.status}
                            onChange={(e) =>
                              upsertMember(m.user_id, m.role, e.target.value)
                            }
                            className="border border-input bg-background px-2 py-1 text-sm"
                          >
                            {['Active', 'Inactive'].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          m.status
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canManageMembers ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeMember(m.user_id)}
                          >
                            Remove
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}

                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-gray-500"
                    >
                      No members assigned yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {canManageMembers && activeProjectId ? (
          <div className="mt-4">
            <div className="text-sm font-semibold text-gray-900">Add member</div>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <select
                value={''}
                onChange={(e) => {
                  const uid = e.target.value;
                  if (uid) void upsertMember(uid, 'Member', 'Active');
                }}
                className="mt-1 min-w-[320px] border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select user…</option>
                {profiles
                  .filter((p) => !members.some((m) => m.user_id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id} ({p.role})
                    </option>
                  ))}
              </select>
              <div className="text-xs text-gray-500">
                Tip: use `/crm/users` to invite a new user first.
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

