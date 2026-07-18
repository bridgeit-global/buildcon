'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { inviteProfileRoles, isOrgAdmin, isSuperAdminOnly } from '@/lib/profile-roles';
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
import { FormActions } from '@/components/ui/form-actions';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormRow, FormRowFull } from '@/components/ui/form-row';
import { FormSection } from '@/components/ui/form-section';
import { FieldLabel } from '@/components/ui/field-label';
import {
  formControlClass,
  formControlFieldGapClass,
  formControlInvalidClass
} from '@/components/ui/form-control';
import { cn } from '@/lib/utils';
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
  projectMemberRemovalKey
} from '@/lib/admin/project-member-pipeline-guard';
import { CrmTableSkeleton } from '../_components/crm-skeletons';
import {
  UsersMembersTable,
  type UsersMemberRow
} from './users-members-table';

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
      const [
        { data: dir, error: dirErr },
        { count: superAdminCount, error: superAdminErr }
      ] = await Promise.all([
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

  const profileNameById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.name || 'Unnamed user'])),
    [profiles]
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
    if (isSuperAdminOnly(profile?.role)) return true;
    if (profile?.role === 'Admin' && profile.id) {
      return members.some(
        (m) =>
          m.user_id === profile.id &&
          m.project_id === projectId &&
          m.status === 'Active'
      );
    }
    return managerProjectIds.has(projectId);
  }

  const canManageAnyMembers =
    isSuperAdminOnly(profile?.role) ||
    (profile?.role === 'Admin' &&
      members.some((m) => m.user_id === profile.id && m.status === 'Active')) ||
    managerProjectIds.size > 0;

  const manageableProjects = useMemo(
    () => projects.filter((p) => canManageProject(p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, profile?.role, profile?.id, members, managerProjectIds]
  );

  const addMemberUserOptions = useMemo(
    () =>
      profiles
        .filter(
          (p) =>
            !members.some(
              (m) =>
                m.user_id === p.id && m.project_id === addMemberProjectId
            )
        )
        .map((p) => profileOptionLabel(p)),
    [profiles, members, addMemberProjectId]
  );

  const memberTableRows = useMemo<UsersMemberRow[]>(
    () =>
      members.map((m) => ({
        projectId: m.project_id,
        userId: m.user_id,
        projectName: projectNameById.get(m.project_id) ?? 'Unknown project',
        userName: profileNameById.get(m.user_id) ?? 'Unknown user',
        role: m.role,
        status: m.status,
        canManage: canManageProject(m.project_id),
        removalBlocked: pipelineBlockedMembers.has(
          projectMemberRemovalKey(m.project_id, m.user_id)
        )
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      members,
      projectNameById,
      profileNameById,
      profile?.role,
      managerProjectIds,
      pipelineBlockedMembers
    ]
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

  const handleRoleChange = useCallback((row: UsersMemberRow, role: string) => {
    void upsertMember(row.projectId, row.userId, role, row.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, managerProjectIds]);

  const handleStatusChange = useCallback(
    (row: UsersMemberRow, status: string) => {
      void upsertMember(row.projectId, row.userId, row.role, status);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.role, managerProjectIds]
  );

  const handleRemove = useCallback(
    (row: UsersMemberRow) => {
      void removeMember(row.projectId, row.userId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.role, managerProjectIds]
  );

  if (loading && !profile && projects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <CrmTableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-sm font-semibold text-ds-gray-900">
              Users &amp; access
            </h1>
            <p className="mt-1 text-xs text-ds-gray-500">
              Manage profile roles and project membership across accessible
              projects.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </Button>
            {isOrgAdmin(profile?.role) ? (
              <Button onClick={() => setOpenInvite(true)}>
                Invite / Add user
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/60 px-4 py-3">
            <div className="text-xs font-medium text-ds-gray-500">Your role</div>
            <div className="mt-1 text-sm font-semibold text-ds-gray-900">
              {profile?.role ?? '—'}
            </div>
          </div>
          <div className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/60 px-4 py-3">
            <div className="text-xs font-medium text-ds-gray-500">Your name</div>
            <div className="mt-1 text-sm font-semibold text-ds-gray-900">
              {profile?.name ?? '—'}
            </div>
          </div>
        </div>

        {!isOrgAdmin(profile?.role) ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Only Admins can invite users and assign project access.
          </p>
        ) : null}
      </Card>

      <FormDialog
        open={openInvite}
        onOpenChange={(next) => {
          setOpenInvite(next);
          if (!next) inviteValidation.resetValidation();
        }}
        title="Invite user and assign projects"
        description="Send an email invite and assign project access for the new team member."
        className="sm:max-w-2xl"
        footer={
          <FormActions
            onCancel={() => setOpenInvite(false)}
            submitLabel="Invite"
            saving={inviting}
            submitType="button"
            onSubmitClick={() => void inviteUser()}
          />
        }
      >
        <div className="space-y-6">
          <FormSection title="User details">
            <FormRow>
              <FormRowFull>
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
              </FormRowFull>
              <TextInputField
                className="md:col-span-2"
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
                <FieldLabel required>Profile role</FieldLabel>
                <Select
                  value={invite.profileRole}
                  onValueChange={(v) => {
                    setInvite((s) => ({ ...s, profileRole: v }));
                    inviteValidation.touch('profileRole');
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      formControlFieldGapClass,
                      formControlClass,
                      inviteValidation.fieldError('profileRole')
                        ? formControlInvalidClass
                        : undefined
                    )}
                    aria-invalid={
                      inviteValidation.fieldError('profileRole')
                        ? true
                        : undefined
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
                <FormFieldError
                  message={inviteValidation.fieldError('profileRole')}
                />
              </div>
              <div>
                <FieldLabel required>Project member role</FieldLabel>
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
                    className={cn(
                      formControlFieldGapClass,
                      formControlClass,
                      inviteValidation.fieldError('projectMemberRole')
                        ? formControlInvalidClass
                        : undefined
                    )}
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
            </FormRow>
          </FormSection>

          <FormSection
            title="Project access"
            description="Select one or more projects for this user."
          >
            <FormRowFull>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Selected: {invite.projectIds.length}
                </div>
                <div className="flex flex-wrap gap-2">
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

              <div className="mt-4">
                <FieldLabel htmlFor="invite-project-search">
                  Search projects
                </FieldLabel>
                <Input
                  id="invite-project-search"
                  className={formControlFieldGapClass}
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
                      className="rounded-full border border-ds-gray-200 bg-card px-3 py-1 text-xs text-ds-gray-700 hover:bg-ds-gray-50"
                      title="Remove"
                    >
                      {projects.find((p) => p.id === id)?.name ??
                        'Unknown project'}{' '}
                      ×
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
                <FieldLabel>Add project</FieldLabel>
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
                  className={formControlFieldGapClass}
                  disabled={
                    projects.length === 0 || filteredProjects.length === 0
                  }
                />
                {projects.length === 0 ? (
                  <div className="mt-2 text-xs text-ds-gray-500">
                    No projects found.
                  </div>
                ) : null}
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                This sends a Supabase email invite and adds rows to{' '}
                <span className="font-mono">profiles</span> and{' '}
                <span className="font-mono">project_members</span>.
              </p>
              <FormFieldError
                message={inviteValidation.fieldError('projectIds')}
              />
            </FormRowFull>
          </FormSection>
        </div>
      </FormDialog>

      <Card className="overflow-hidden rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold text-ds-gray-900">
            Project members
          </div>
          <p className="mt-1 text-xs text-ds-gray-500">
            {members.length} member{members.length !== 1 ? 's' : ''} across
            projects
          </p>
        </div>

        <UsersMembersTable
          rows={memberTableRows}
          loading={loading}
          onRoleChange={handleRoleChange}
          onStatusChange={handleStatusChange}
          onRemove={handleRemove}
        />

        {canManageAnyMembers ? (
          <div className="mt-6 border-t border-ds-gray-100 pt-4">
            <div className="text-sm font-semibold text-ds-gray-900">
              Add member
            </div>
            <p className="mt-1 text-xs text-ds-gray-500">
              Assign an existing profile to a project you manage.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full min-w-0 sm:max-w-56">
                <Label className="text-xs text-ds-gray-500">Project</Label>
                <SearchableSelect
                  value={
                    manageableProjects.find((p) => p.id === addMemberProjectId)
                      ?.name ?? ''
                  }
                  onValueChange={(name) => {
                    const project = manageableProjects.find(
                      (p) => p.name === name
                    );
                    setAddMemberProjectId(project?.id ?? '');
                  }}
                  options={manageableProjects.map((p) => p.name)}
                  placeholder="Select project…"
                  searchPlaceholder="Search project…"
                  className="mt-1 w-full"
                />
              </div>
              <div className="w-full min-w-0 sm:max-w-sm">
                <Label className="text-xs text-ds-gray-500">User</Label>
                <SearchableSelect
                  key={addMemberPickerKey}
                  value=""
                  onValueChange={(label) => {
                    if (!addMemberProjectId) return;
                    const user = profiles.find(
                      (p) =>
                        profileOptionLabel(p) === label &&
                        !members.some(
                          (m) =>
                            m.user_id === p.id &&
                            m.project_id === addMemberProjectId
                        )
                    );
                    if (!user) return;
                    void upsertMember(
                      addMemberProjectId,
                      user.id,
                      'Member',
                      'Active'
                    );
                    setAddMemberPickerKey((k) => k + 1);
                  }}
                  options={addMemberUserOptions}
                  placeholder="Select user…"
                  searchPlaceholder="Search user…"
                  className="mt-1 w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground sm:pb-2">
                Tip: Admins can invite new users. Super Admin is limited to one
                account.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {profile?.role === 'Super Admin' ? (
        <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
          <div className="text-sm font-semibold text-ds-gray-900">
            Buyer / channel partner portal
          </div>
          <p className="mt-1 text-xs text-ds-gray-500">
            Link an auth user to a <span className="font-mono">customers</span>{' '}
            row for the buyer portal, or to a{' '}
            <span className="font-mono">brokers</span> row for broker-scoped
            inquiry reads.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs text-ds-gray-500">Staff user</Label>
              <SearchableSelect
                value={(() => {
                  const row = portalDirectory.find((p) => p.id === portalUserId);
                  return row ? profileOptionLabel(row) : '';
                })()}
                onValueChange={(label) => {
                  const row = portalDirectory.find(
                    (p) => profileOptionLabel(p) === label
                  );
                  if (!row) return;
                  setPortalUserId(row.id);
                  portalValidation.touch('portalUserId');
                  setPortalCustomerId(row.linked_customer_id ?? '');
                  setPortalBrokerId(row.linked_broker_id ?? '');
                }}
                options={portalDirectory.map((p) => profileOptionLabel(p))}
                placeholder="Select user…"
                searchPlaceholder="Search user…"
              />
              <FormFieldError
                message={portalValidation.fieldError('portalUserId')}
              />
            </div>
            <TextInputField
              label="Linked customer id (UUID)"
              labelClassName="text-xs"
              value={portalCustomerId}
              onChange={(e) => {
                setPortalCustomerId(e.target.value);
                portalValidation.touch('portalCustomerId');
              }}
              onBlur={() => portalValidation.touch('portalCustomerId')}
              error={portalValidation.fieldError('portalCustomerId')}
              placeholder="00000000-0000-0000-0000-000000000000"
              inputClassName="font-mono text-xs"
            />
            <TextInputField
              className="sm:col-span-2"
              label="Linked broker id (UUID, optional)"
              labelClassName="text-xs"
              value={portalBrokerId}
              onChange={(e) => {
                setPortalBrokerId(e.target.value);
                portalValidation.touch('portalBrokerId');
              }}
              onBlur={() => portalValidation.touch('portalBrokerId')}
              error={portalValidation.fieldError('portalBrokerId')}
              placeholder="Optional"
              inputClassName="font-mono text-xs"
            />
          </div>
          <Button
            className="mt-3"
            type="button"
            disabled={savingPortal}
            onClick={() => void savePortalLinks()}
          >
            {savingPortal ? 'Saving…' : 'Save portal links'}
          </Button>
          <p className="mt-2 text-xs text-ds-gray-500">
            Buyer portal: <span className="font-mono">/portal</span> after
            login.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
