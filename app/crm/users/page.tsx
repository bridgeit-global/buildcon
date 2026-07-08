'use client';

import { useEffect, useMemo, useState } from 'react';
import { inviteProfileRoles, isOrgAdmin } from '@/lib/profile-roles';
import { pageError } from '@/lib/toast';
import {
  portalLinksSchema,
  userInviteSchema
} from '@/lib/admin/user-invite.schema';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  buildProjectMemberRemovalBlockSet,
  PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE,
  projectMemberRemovalKey
} from '@/lib/admin/project-member-pipeline-guard';
import { CrmTableSkeleton } from '../_components/crm-skeletons';

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

function profileOptionLabel(p: { name: string | null; role: string }) {
  return `${p.name || 'Unnamed user'} (${p.role})`;
}

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
  const [superAdminExists, setSuperAdminExists] = useState(false);
  const [loading, setLoading] = useState(true);

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
  const [pipelineBlockedMembers, setPipelineBlockedMembers] = useState(
    () => new Set<string>()
  );

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

    if (isOrgAdmin(myProfileRole)) {
      const [{ data: dir, error: dirErr }, { count: superAdminCount, error: superAdminErr }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id,name,role,linked_customer_id,linked_broker_id')
            .order('name', { ascending: true })
            .limit(500),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'Super Admin')
        ]);
      if (dirErr) pageError(dirErr.message);
      if (superAdminErr) pageError(superAdminErr.message);
      setPortalDirectory((dir ?? []) as ProfileRow[]);
      setSuperAdminExists((superAdminCount ?? 0) > 0);
    } else {
      setPortalDirectory([]);
      setSuperAdminExists(false);
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

    if (isOrgAdmin(myProfileRole) || isManagerOnAnyProject) {
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

    const memberProjectIds = [
      ...new Set((memberData ?? []).map((m) => m.project_id).filter(Boolean))
    ];
    if (memberProjectIds.length > 0) {
      const { data: pipelineRows, error: pipelineErr } = await supabase
        .from('sales_inquiries')
        .select('project_id, assigned_to, funnel_stage, stage_data, unit_id')
        .in('project_id', memberProjectIds)
        .not('unit_id', 'is', null)
        .not('assigned_to', 'is', null);
      if (pipelineErr) {
        pageError(pipelineErr.message);
        setPipelineBlockedMembers(new Set());
      } else {
        setPipelineBlockedMembers(
          buildProjectMemberRemovalBlockSet(
            (pipelineRows ?? []) as Array<{
              project_id: string;
              assigned_to: string | null;
              funnel_stage: string | null;
              stage_data: unknown;
              unit_id: string | null;
            }>
          )
        );
      }
    } else {
      setPipelineBlockedMembers(new Set());
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

  const toggleProjectById = (id: string) => {
    if (!id) return;
    setInvite((s) => ({
      ...s,
      projectIds: s.projectIds.includes(id)
        ? s.projectIds.filter((x) => x !== id)
        : [...s.projectIds, id]
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
          email: parsed.data.email,
          name: parsed.data.name,
          profileRole: parsed.data.profileRole,
          projectIds: parsed.data.projectIds,
          projectMemberRole: parsed.data.projectMemberRole
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

  const inviteRoleOptions = useMemo(
    () =>
      inviteProfileRoles({
        inviterRole: profile?.role,
        superAdminExists
      }),
    [profile?.role, superAdminExists]
  );

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
    return isOrgAdmin(profile?.role) || managerProjectIds.has(projectId);
  }

  const canManageAnyMembers =
    isOrgAdmin(profile?.role) || managerProjectIds.size > 0;

  const manageableProjects = useMemo(
    () => projects.filter((p) => canManageProject(p.id)),
    [projects, profile?.role, managerProjectIds]
  );

  const addMemberUserOptions = useMemo(
    () =>
      profiles
        .filter((p) => !members.some((m) => m.user_id === p.id))
        .map((p) => profileOptionLabel(p)),
    [profiles, members]
  );

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

  if (loading && !profile && projects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <CrmTableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
          </div>

          {isOrgAdmin(profile?.role) ? (
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
                      required
                        value={invite.email}
                        onChange={(v) => {
                          setInvite((s) => ({ ...s, email: v }));
                          inviteValidation.touch('email');
                        }}
                        error={inviteValidation.fieldError('email')}
                        placeholder="user@company.com"
                      />
                    </div>
                    <TextInputField
                      className="col-span-2"
                      label="Name"
                      required
                      value={invite.name}
                      onChange={(e) => {
                        setInvite((s) => ({ ...s, name: e.target.value }));
                        inviteValidation.touch('name');
                      }}
                      error={inviteValidation.fieldError('name')}
                      placeholder="Full name"
                    />
                    <div>
                      <Label>Profile role</Label>
                      <Select
                        value={invite.profileRole}
                        onValueChange={(v) => {
                          setInvite((s) => ({ ...s, profileRole: v }));
                          inviteValidation.touch('profileRole');
                        }}
                      >
                        <SelectTrigger
                          className="mt-1 w-full"
                          aria-invalid={
                            inviteValidation.fieldError('profileRole') ? true : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {inviteRoleOptions.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormFieldError message={inviteValidation.fieldError('profileRole')} />
                    </div>
                    <div>
                      <Label>Project member role</Label>
                      <Select
                        value={invite.projectMemberRole}
                        onValueChange={(v) => {
                          setInvite((s) => ({
                            ...s,
                            projectMemberRole: v
                          }));
                          inviteValidation.touch('projectMemberRole');
                        }}
                      >
                        <SelectTrigger
                          className="mt-1 w-full"
                          aria-invalid={
                            inviteValidation.fieldError('projectMemberRole')
                              ? true
                              : undefined
                          }
                        >
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
                      <FormFieldError
                        message={inviteValidation.fieldError('projectMemberRole')}
                      />
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
                              className="rounded-full border border-ds-gray-200 bg-white px-3 py-1 text-xs text-ds-gray-700 hover:bg-ds-gray-50"
                              title="Remove"
                            >
                              {projects.find((p) => p.id === id)?.name ?? 'Unknown project'} ×
                            </button>
                          ))}
                          {invite.projectIds.length > 8 ? (
                            <div className="rounded-full border border-ds-gray-200 bg-ds-gray-50 px-3 py-1 text-xs text-ds-gray-500">
                              +{invite.projectIds.length - 8} more
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <SearchableSelect
                          value=""
                          onValueChange={(name) => {
                            const project = filteredProjects.find((p) => p.name === name);
                            toggleProjectById(project?.id ?? '');
                          }}
                          options={filteredProjects.map((p) => p.name)}
                          placeholder={
                            filteredProjects.length === 0
                              ? 'No projects match your search.'
                              : 'Select project…'
                          }
                          searchPlaceholder="Search project…"
                          className="w-full"
                          disabled={projects.length === 0 || filteredProjects.length === 0}
                        />
                        {projects.length === 0 ? (
                          <div className="mt-2 text-xs text-ds-gray-500">
                            No projects found.
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        This sends a Supabase email invite and adds rows to{' '}
                        <span className="font-mono">profiles</span> and{' '}
                        <span className="font-mono">project_members</span>.
                      </div>
                      <FormFieldError message={inviteValidation.fieldError('projectIds')} />
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
              Only Admins can invite users and assign project access.
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
                  {['Project', 'User', 'Role', 'Status', 'Actions'].map(
                    (h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold border-b">
                      {h}
                    </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const removalBlocked = pipelineBlockedMembers.has(
                    projectMemberRemovalKey(m.project_id, m.user_id)
                  );
                  return (
                  <tr key={`${m.project_id}-${m.user_id}`} className="border-b">
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs text-gray-600">
                      {projectNameById.get(m.project_id) ?? 'Unknown project'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {profiles.find((p) => p.id === m.user_id)?.name ??
                        'Unknown user'}
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
                          disabled={removalBlocked}
                          title={
                            removalBlocked
                              ? PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE
                              : undefined
                          }
                          onClick={() => removeMember(m.project_id, m.user_id)}
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
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
                  <SearchableSelect
                    value={
                      manageableProjects.find((p) => p.id === addMemberProjectId)
                        ?.name ?? ''
                    }
                    onValueChange={(name) => {
                      const project = manageableProjects.find((p) => p.name === name);
                      setAddMemberProjectId(project?.id ?? '');
                    }}
                    options={manageableProjects.map((p) => p.name)}
                    placeholder="Select project…"
                    searchPlaceholder="Search project…"
                    className="mt-1 w-full"
                  />
                </div>
                <SearchableSelect
                  key={addMemberPickerKey}
                  value=""
                  onValueChange={(label) => {
                    if (!addMemberProjectId) return;
                    const user = profiles.find(
                      (p) =>
                        profileOptionLabel(p) === label &&
                        !members.some((m) => m.user_id === p.id)
                    );
                    if (!user) return;
                    void upsertMember(addMemberProjectId, user.id, 'Member', 'Active');
                    setAddMemberPickerKey((k) => k + 1);
                  }}
                  options={addMemberUserOptions}
                  placeholder="Select user…"
                  searchPlaceholder="Search user…"
                  className="mt-1 min-w-[320px] w-[min(320px,100%)]"
                />
                <div className="text-xs text-gray-500">
                  Tip: Admins can invite new users. Super Admin role is limited to one account.
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

