'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

type ProfileRow = { id: string; name: string | null; role: string };
type MemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

export default function UsersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [openInvite, setOpenInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [invite, setInvite] = useState({
    email: '',
    name: '',
    profileRole: 'CRM Executive',
    projectMemberRole: 'Member',
    projectIds: [] as string[]
  });

  async function load() {
    setLoading(true);
    setError('');

    const {
      data: { user },
      error: userErr
    } = await supabase.auth.getUser();

    if (userErr) setError(userErr.message);
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) setError(error.message);
      setProfile((data ?? null) as ProfileRow | null);
    }

    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .select('id,name')
      .order('created_at', { ascending: false })
      .limit(200);
    if (projErr) setError(projErr.message);
    setProjects((projData ?? []) as Array<{ id: string; name: string }>);

    if (activeProjectId) {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id,user_id,role,status,created_at')
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: true });
      if (error) setError(error.message);
      setMembers((data ?? []) as MemberRow[]);
    } else {
      setMembers([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.trim().toLowerCase())
  );

  const selectAllVisibleProjects = () => {
    const ids = filteredProjects.map((p) => p.id);
    setInvite((s) => ({
      ...s,
      projectIds: Array.from(new Set([...s.projectIds, ...ids]))
    }));
  };

  const clearAllProjects = () => {
    setInvite((s) => ({ ...s, projectIds: [] }));
  };

  const removeProject = (id: string) => {
    setInvite((s) => ({
      ...s,
      projectIds: s.projectIds.filter((x) => x !== id)
    }));
  };

  async function inviteUser() {
    setInviting(true);
    setError('');
    try {
      const res = await fetch('/api/crm/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: invite.email,
          name: invite.name || null,
          profileRole: invite.profileRole,
          projectIds: invite.projectIds,
          projectMemberRole: invite.projectMemberRole
        })
      });
      const json = (await res.json()) as { userId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Invite failed');
      setOpenInvite(false);
      setInvite({
        email: '',
        name: '',
        profileRole: 'CRM Executive',
        projectMemberRole: 'Member',
        projectIds: []
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Users & Access (MVP)
          </div>
          <div className="text-xs text-gray-500">
            View your role and the active project’s membership list.
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Card>

      {error ? (
        <Card className="p-4 border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">My profile</div>
          <div className="mt-3 text-sm text-gray-700">
            <div>
              <span className="text-gray-500">Role:</span>{' '}
              <strong>{profile?.role ?? '—'}</strong>
            </div>
            <div className="mt-1">
              <span className="text-gray-500">Name:</span>{' '}
              <strong>{profile?.name ?? '—'}</strong>
            </div>
            <div className="mt-1">
              <span className="text-gray-500">User id:</span>{' '}
              <span className="font-mono text-xs">{profile?.id ?? '—'}</span>
            </div>
          </div>

          {profile?.role === 'Super Admin' ? (
            <div className="mt-4">
              <Dialog open={openInvite} onOpenChange={setOpenInvite}>
                <DialogTrigger asChild>
                  <Button>Invite / Add user</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Invite user and assign projects</DialogTitle>
                  </DialogHeader>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Email</Label>
                      <Input
                        value={invite.email}
                        onChange={(e) =>
                          setInvite((s) => ({ ...s, email: e.target.value }))
                        }
                        placeholder="user@company.com"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Name (optional)</Label>
                      <Input
                        value={invite.name}
                        onChange={(e) =>
                          setInvite((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <Label>Profile role</Label>
                      <select
                        value={invite.profileRole}
                        onChange={(e) =>
                          setInvite((s) => ({
                            ...s,
                            profileRole: e.target.value
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {[
                          'Super Admin',
                          'Sales Manager',
                          'Collection Agent',
                          'CRM Executive',
                          'Read Only'
                        ].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Project member role</Label>
                      <select
                        value={invite.projectMemberRole}
                        onChange={(e) =>
                          setInvite((s) => ({
                            ...s,
                            projectMemberRole: e.target.value
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {['Member', 'Manager'].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Assign projects
                          </div>
                          <div className="text-xs text-gray-500">
                            Selected: {invite.projectIds.length}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={selectAllVisibleProjects}
                            disabled={filteredProjects.length === 0}
                          >
                            Select visible
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={clearAllProjects}
                            disabled={invite.projectIds.length === 0}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2">
                        <Label>Search projects</Label>
                        <Input
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          placeholder="Type to filter…"
                        />
                      </div>

                      {invite.projectIds.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {invite.projectIds.slice(0, 8).map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => removeProject(id)}
                              className="rounded-full border bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              title="Remove"
                            >
                              {projects.find((p) => p.id === id)?.name ?? id} ×
                            </button>
                          ))}
                          {invite.projectIds.length > 8 ? (
                            <div className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-500">
                              +{invite.projectIds.length - 8} more
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-[240px] overflow-auto rounded-lg border bg-gray-50 p-2">
                        {filteredProjects.map((p) => {
                          const checked = invite.projectIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${checked
                                  ? 'border-blue-200 bg-blue-50'
                                  : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setInvite((s) => ({
                                    ...s,
                                    projectIds: checked
                                      ? s.projectIds.filter((x) => x !== p.id)
                                      : [...s.projectIds, p.id]
                                  }))
                                }
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">
                                  {p.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {p.id}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {projects.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">
                            No projects found.
                          </div>
                        ) : null}
                        {projects.length > 0 && filteredProjects.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">
                            No projects match your search.
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        This sends a Supabase email invite and adds rows to{' '}
                        <span className="font-mono">profiles</span> and{' '}
                        <span className="font-mono">project_members</span>.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setOpenInvite(false)}
                      disabled={inviting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={inviteUser}
                      disabled={inviting || !invite.email}
                    >
                      {inviting ? 'Inviting…' : 'Invite'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="mt-4 text-xs text-gray-500">
              Only Super Admin can invite users and assign project access.
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">
            Active project members
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {activeProjectId ? members.length : 0} member(s)
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {['User id', 'Role', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">
                      {m.user_id}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{m.role}</td>
                    <td className="px-3 py-2 text-gray-700">{m.status}</td>
                  </tr>
                ))}
                {activeProjectId && members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                      No members found (or you don’t have access).
                    </td>
                  </tr>
                ) : null}
                {!activeProjectId ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                      Select a project first.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

