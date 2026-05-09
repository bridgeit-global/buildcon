'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import type { CrmProject } from '../_components/types';
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

type ProfileRow = { id: string; name: string | null; role: string };
type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

export default function ProjectSettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId, setActiveProjectId } = useActiveProjectContext();

  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [open, setOpen] = useState(false);
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

    const { data, error } = await supabase
      .from('projects')
      .select(
        'id,name,location,type,status,fy,rera_no,floors_per_wing,units_per_floor,base_rate,min_rate,max_rate'
      )
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setProjects((data ?? []) as CrmProject[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCreateProject = myProfile?.role === 'Super Admin';
  const canManageMembers = myProfile?.role === 'Super Admin' || myProjectRole === 'Manager';

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
      await loadBase();
      if (json.projectId) setActiveProjectId(json.projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

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
      <Card className="p-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            Project Settings
          </div>
          <div className="text-xs text-gray-500">
            Create projects, seed inventory, and switch scope.
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canCreateProject}>Create project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
            </DialogHeader>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

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
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

              <div>
                <Label>Floors per wing</Label>
                <Input
                  type="number"
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
                  value={draft.units_per_floor}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      units_per_floor: Number(e.target.value)
                    }))
                  }
                />
              </div>

              <div>
                <Label>Base rate (₹/sq.ft)</Label>
                <Input
                  type="number"
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
                <Label>Min / Max rate</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={draft.min_rate}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        min_rate: Number(e.target.value)
                      }))
                    }
                  />
                  <Input
                    type="number"
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

              {canCreateProject ? (
                <div className="col-span-2">
                  <div className="flex items-center justify-between">
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

                  <div className="mt-2">
                    <Label>Search users</Label>
                    <Input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search by name, role, or id…"
                    />
                  </div>

                  {draft.memberIds.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.memberIds.slice(0, 8).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => removeMemberChip(id)}
                          className="rounded-full border bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          title="Remove"
                        >
                          {profiles.find((p) => p.id === id)?.name ?? id} ×
                        </button>
                      ))}
                      {draft.memberIds.length > 8 ? (
                        <div className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-500">
                          +{draft.memberIds.length - 8} more
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-2 gap-2 max-h-[240px] overflow-auto rounded-lg border bg-gray-50 p-2">
                    {filteredProfiles.map((p) => {
                      const checked = draft.memberIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                            checked
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
                            <div className="font-semibold text-gray-900 truncate">
                              {p.name || 'Unnamed user'}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
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
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={createProject} disabled={creating || !draft.name}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Accessible projects
            </div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading…' : `${projects.length} project(s)`}
            </div>
          </div>
          <Button variant="outline" onClick={loadBase} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProjectId(p.id)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                activeProjectId === p.id
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.type} · {p.status} · FY {p.fy ?? '—'}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Wings: {p.floors_per_wing} floors · {p.units_per_floor} units/floor
              </div>
            </button>
          ))}

          {!loading && projects.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500">
              No projects are accessible yet. Create one (Super Admin) or ask an
              admin to add you to `project_members`.
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
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
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
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
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
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
                className="mt-1 min-w-[320px] rounded-md border border-input bg-background px-3 py-2 text-sm"
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

