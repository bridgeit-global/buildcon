'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import {
  portalLinksSchema,
  userInviteSchema
} from '@/lib/admin/user-invite.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { shortId } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmailInputField } from '@/components/ui/email-input-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type ProfileRow = {
  id: string;
  name: string | null;
  role: string;
  linked_customer_id?: string | null;
  linked_broker_id?: string | null;
};
type MemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

export default function UsersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [addMemberProjectId, setAddMemberProjectId] = useState('');

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [loading, setLoading] = useState(false);

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
  const [addMemberPickerKey, setAddMemberPickerKey] = useState(0);

  const [portalDirectory, setPortalDirectory] = useState<ProfileRow[]>([]);
  const [portalUserId, setPortalUserId] = useState('');
  const [portalCustomerId, setPortalCustomerId] = useState('');
  const [portalBrokerId, setPortalBrokerId] = useState('');
  const [savingPortal, setSavingPortal] = useState(false);

  const inviteValidation = useFieldValidation(
    userInviteSchema,
    useMemo(
      () => ({
        email: invite.email,
        name: invite.name,
        profileRole: invite.profileRole,
        projectMemberRole: invite.projectMemberRole,
        projectIds: invite.projectIds
      }),
      [invite]
    )
  );

  const portalValidation = useFieldValidation(
    portalLinksSchema,
    useMemo(
      () => ({
        portalUserId,
        portalCustomerId,
        portalBrokerId
      }),
      [portalUserId, portalCustomerId, portalBrokerId]
    )
  );

  async function load() {
    setLoading(true);
    
    const {
      data: { user },
      error: userErr
    } = await supabase.auth.getUser();

    if (userErr) pageError(userErr.message);
    let myProfileRole: string | null = null;
    if (user) {
      const { data: myProf, error } = await supabase
        .from('profiles')
        .select('id,name,role,linked_customer_id,linked_broker_id')
        .eq('id', user.id)
        .maybeSingle();
      if (error) pageError(error.message);
      setProfile((myProf ?? null) as ProfileRow | null);
      myProfileRole = (myProf?.role ?? null) as string | null;
    }

    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .select('id,name')
      .order('created_at', { ascending: false })
      .limit(200);
    if (projErr) pageError(projErr.message);
    setProjects((projData ?? []) as Array<{ id: string; name: string }>);

    if (myProfileRole === 'Super Admin') {
      const { data: dir, error: dirErr } = await supabase
        .from('profiles')
        .select('id,name,role,linked_customer_id,linked_broker_id')
        .order('name', { ascending: true })
        .limit(500);
      if (dirErr) pageError(dirErr.message);
      setPortalDirectory((dir ?? []) as ProfileRow[]);
    } else {
      setPortalDirectory([]);
    }

    const { data: memberData, error } = await supabase
      .from('project_members')
      .select('project_id,user_id,role,status,created_at')
      .order('created_at', { ascending: true });
    if (error) pageError(error.message);
    setMembers((memberData ?? []) as MemberRow[]);

    const isManagerOnAnyProject = user
      ? (memberData ?? []).some(
          (m) => m.user_id === user.id && m.role === 'Manager'
        )
      : false;
    if (user) {
      setMyProjectRole(isManagerOnAnyProject ? 'Manager' : null);
    } else {
      setMyProjectRole(null);
    }

    if (myProfileRole === 'Super Admin' || isManagerOnAnyProject) {
      const { data: staffData, error: staffErr } = await supabase
        .from('profiles')
        .select('id,name,role,linked_customer_id,linked_broker_id')
        .order('created_at', { ascending: false })
        .limit(500);
      if (staffErr) pageError(staffErr.message);
      setProfiles((staffData ?? []) as ProfileRow[]);
    } else {
      setProfiles([]);
    }

    if (!addMemberProjectId && (projData ?? [])[0]) {
      setAddMemberProjectId((projData ?? [])[0]!.id);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const parsed = inviteValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before inviting.');
      return;
    }
    setInviting(true);
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
      inviteValidation.resetValidation();
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const managerProjectIds = useMemo(() => {
    if (!profile) return new Set<string>();
    return new Set(
      members
        .filter((m) => m.user_id === profile.id && m.role === 'Manager')
        .map((m) => m.project_id)
    );
  }, [members, profile]);

  function canManageProject(projectId: string) {
    return profile?.role === 'Super Admin' || managerProjectIds.has(projectId);
  }

  const canManageAnyMembers =
    profile?.role === 'Super Admin' || managerProjectIds.size > 0;

  async function upsertMember(
    projectId: string,
    userId: string,
    role: string,
    status: string
  ) {
    if (!canManageProject(projectId)) return;
        const res = await fetch('/api/crm/admin/project-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, userId, role, status })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) pageError(json.error || 'Failed to update member');
    await load();
  }

  async function savePortalLinks() {
    const parsed = portalValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSavingPortal(true);
        try {
      const cust = portalCustomerId.trim() || null;
      const brok = portalBrokerId.trim() || null;
      const { error: uErr } = await supabase
        .from('profiles')
        .update({
          linked_customer_id: cust,
          linked_broker_id: brok
        })
        .eq('id', portalUserId.trim());
      if (uErr) throw uErr;
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save portal links');
    } finally {
      setSavingPortal(false);
    }
  }

  async function removeMember(projectId: string, userId: string) {
    if (!canManageProject(projectId)) return;
        const res = await fetch('/api/crm/admin/project-members', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, userId })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) pageError(json.error || 'Failed to remove member');
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Users & Access (MVP)
          </div>
          <div className="text-xs text-gray-500">
            View your role and project membership across all accessible projects.
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Card>

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
              <Dialog
                open={openInvite}
                onOpenChange={(next) => {
                  setOpenInvite(next);
                  if (!next) inviteValidation.resetValidation();
                }}
              >
                <DialogTrigger asChild>
                  <Button>Invite / Add user</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Invite user and assign projects</DialogTitle>
                  </DialogHeader>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <EmailInputField
                        value={invite.email}
                        onChange={(v) => {
                          setInvite((s) => ({ ...s, email: v }));
                          inviteValidation.touch('email');
                        }}
                        error={inviteValidation.fieldError('email')}
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
                      <Select
                        value={invite.profileRole}
                        onValueChange={(v) =>
                          setInvite((s) => ({ ...s, profileRole: v }))
                        }
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            'Super Admin',
                            'Sales Manager',
                            'Collection Agent',
                            'CRM Executive',
                            'Read Only'
                          ].map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Project member role</Label>
                      <Select
                        value={invite.projectMemberRole}
                        onValueChange={(v) =>
                          setInvite((s) => ({
                            ...s,
                            projectMemberRole: v
                          }))
                        }
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Member', 'Manager'].map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) =>
                                  setInvite((s) => ({
                                    ...s,
                                    projectIds:
                                      next === true
                                        ? [...s.projectIds, p.id]
                                        : s.projectIds.filter((x) => x !== p.id)
                                  }))
                                }
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">
                                  {p.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {shortId(p.id)}
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
                      {inviteValidation.fieldError('projectIds') ? (
                        <p className="mt-2 text-xs text-red-600">
                          {inviteValidation.fieldError('projectIds')}
                        </p>
                      ) : null}
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
                      onClick={() => void inviteUser()}
                      disabled={inviting}
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
            Project members
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {members.length} member(s) across projects
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {['Project', 'User id', 'Role', 'Status', 'Actions'].map(
                    (h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold border-b">
                      {h}
                    </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={`${m.project_id}-${m.user_id}`} className="border-b">
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs text-gray-600">
                      {projectNameById.get(m.project_id) ?? m.project_id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">
                      {m.user_id}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {canManageProject(m.project_id) ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) =>
                            upsertMember(m.project_id, m.user_id, v, m.status)
                          }
                        >
                          <SelectTrigger size="sm" className="h-8 w-auto min-w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['Member', 'Manager'].map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {canManageProject(m.project_id) ? (
                        <Select
                          value={m.status}
                          onValueChange={(v) =>
                            upsertMember(m.project_id, m.user_id, m.role, v)
                          }
                        >
                          <SelectTrigger size="sm" className="h-8 w-auto min-w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['Active', 'Inactive'].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        m.status
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManageProject(m.project_id) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeMember(m.project_id, m.user_id)}
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No members found (or you don’t have access).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canManageAnyMembers ? (
            <div className="mt-4">
              <div className="text-sm font-semibold text-gray-900">Add member</div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <Label className="text-xs">Project</Label>
                  <Select
                    value={addMemberProjectId || undefined}
                    onValueChange={setAddMemberProjectId}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects
                        .filter((p) => canManageProject(p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  key={addMemberPickerKey}
                  onValueChange={(uid) => {
                    if (!addMemberProjectId) return;
                    void upsertMember(addMemberProjectId, uid, 'Member', 'Active');
                    setAddMemberPickerKey((k) => k + 1);
                  }}
                >
                  <SelectTrigger className="mt-1 min-w-[320px] w-[min(320px,100%)]">
                    <SelectValue placeholder="Select user…" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles
                      .filter((p) => !members.some((m) => m.user_id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name || shortId(p.id)} ({p.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500">
                  Tip: only Super Admin can invite new users.
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {profile?.role === 'Super Admin' ? (
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">
            Buyer / channel partner portal
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Link an auth user to a <span className="font-mono">customers</span>{' '}
            row for the buyer portal, or to a <span className="font-mono">brokers</span>{' '}
            row for broker-scoped inquiry reads.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Staff user</Label>
              <Select
                value={portalUserId || undefined}
                onValueChange={(id) => {
                  setPortalUserId(id);
                  portalValidation.touch('portalUserId');
                  const row = portalDirectory.find((p) => p.id === id);
                  setPortalCustomerId(row?.linked_customer_id ?? '');
                  setPortalBrokerId(row?.linked_broker_id ?? '');
                }}
              >
                <SelectTrigger
                  aria-invalid={
                    portalValidation.fieldError('portalUserId') ? true : undefined
                  }
                >
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  {portalDirectory.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || shortId(p.id)} ({p.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormFieldError message={portalValidation.fieldError('portalUserId')} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Linked customer id (UUID)</Label>
              <Input
                value={portalCustomerId}
                onChange={(e) => {
                  setPortalCustomerId(e.target.value);
                  portalValidation.touch('portalCustomerId');
                }}
                onBlur={() => portalValidation.touch('portalCustomerId')}
                aria-invalid={
                  portalValidation.fieldError('portalCustomerId') ? true : undefined
                }
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
              <FormFieldError
                message={portalValidation.fieldError('portalCustomerId')}
              />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Linked broker id (UUID, optional)</Label>
              <Input
                value={portalBrokerId}
                onChange={(e) => {
                  setPortalBrokerId(e.target.value);
                  portalValidation.touch('portalBrokerId');
                }}
                onBlur={() => portalValidation.touch('portalBrokerId')}
                aria-invalid={
                  portalValidation.fieldError('portalBrokerId') ? true : undefined
                }
                placeholder="Optional"
                className="font-mono text-xs"
              />
              <FormFieldError message={portalValidation.fieldError('portalBrokerId')} />
            </div>
          </div>
          <Button
            className="mt-3"
            type="button"
            disabled={savingPortal}
            onClick={() => void savePortalLinks()}
          >
            {savingPortal ? 'Saving…' : 'Save portal links'}
          </Button>
          <p className="mt-2 text-xs text-gray-500">
            Buyer portal: <span className="font-mono">/portal</span> after login.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

