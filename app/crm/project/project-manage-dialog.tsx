'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import {
  projectDetailsSchemaWithExisting,
  projectPricingSchema
} from '@/lib/project/project-manage.schema';
import { PROJECT_NAME_DUPLICATE_ERROR } from '@/lib/project/project-name';
import type { ProjectNameRow } from '@/lib/project/project-name';
import { TextInputField } from '@/components/ui/text-input-field';
import { FormFieldError } from '@/components/ui/form-field-error';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmProjectListItem } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { coerceProjectFy, isReadyProjectType } from '@/lib/project/project-fy';
import { ProjectFySelect } from './project-fy-select';

type ProfileRow = { id: string; name: string | null; role: string };
type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

const PROJECT_TYPES = [
  'Redevelopment',
  'Greenfield',
  'Mixed Use',
  'Development',
  'Ready'
] as const;
const PROJECT_STATUSES = ['Active', 'Planning', 'On Hold', 'Inactive'] as const;

type ManageTab = 'details' | 'members' | 'pricing';

export function ProjectManageDialog({
  open,
  onOpenChange,
  project,
  supabase,
  isSuperAdmin,
  onUpdated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: CrmProjectListItem | null;
  supabase: SupabaseClient;
  isSuperAdmin: boolean;
  onUpdated: () => void;
}) {
  const [tab, setTab] = useState<ManageTab>('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [addMemberPickerKey, setAddMemberPickerKey] = useState(0);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<string>('Redevelopment');
  const [status, setStatus] = useState<string>('Active');
  const [fy, setFy] = useState('');
  const [reraNo, setReraNo] = useState('');
  const [baseRate, setBaseRate] = useState('');

  const [pricingGstReg, setPricingGstReg] = useState(false);
  const [pricingGstPct, setPricingGstPct] = useState('0');
  const [pricingStampPct, setPricingStampPct] = useState('0');
  const [pricingRegFee, setPricingRegFee] = useState('0');
  const [pricingLoading, setPricingLoading] = useState(false);
  const [existingProjects, setExistingProjects] = useState<ProjectNameRow[]>([]);

  const canManageMembers = isSuperAdmin || myProjectRole === 'Manager';
  const canEditDetails = isSuperAdmin;
  const canEditPricing = isSuperAdmin;

  const detailsSchema = useMemo(
    () =>
      projectDetailsSchemaWithExisting(existingProjects, project?.id ?? undefined),
    [existingProjects, project?.id]
  );

  const detailsValidation = useFieldValidation(detailsSchema, {
    name,
    location,
    type,
    status,
    fy,
    rera_no: reraNo,
    base_rate: baseRate
  });

  const pricingValidation = useFieldValidation(projectPricingSchema, {
    gstPct: pricingGstPct,
    stampPct: pricingStampPct,
    regFee: pricingRegFee
  });

  const loadExistingProjects = useCallback(async () => {
    if (!isSuperAdmin) {
      setExistingProjects([]);
      return;
    }
    const { data, error: projectErr } = await supabase
      .from('projects')
      .select('id,name')
      .order('name', { ascending: true });
    if (projectErr) {
      pageError(projectErr.message);
      return;
    }
    setExistingProjects((data ?? []) as ProjectNameRow[]);
  }, [isSuperAdmin, supabase]);

  const resetFromProject = useCallback((p: CrmProjectListItem) => {
    setName(p.name);
    setLocation(p.location ?? '');
    setType(p.type);
    setStatus(p.status);
    setFy(p.fy ?? '');
    setReraNo(p.rera_no ?? '');
    setBaseRate(p.base_rate != null ? String(p.base_rate) : '');
  }, []);

  const loadMembers = useCallback(async () => {
    if (!project) return;
    const { data, error: memberErr } = await supabase
      .from('project_members')
      .select('project_id,user_id,role,status,created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });
    if (memberErr) {
      pageError(memberErr.message);
      return;
    }
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
  }, [project, supabase]);

  const loadProfiles = useCallback(async () => {
    if (!isSuperAdmin && myProjectRole !== 'Manager') {
      setProfiles([]);
      return;
    }
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('id,name,role')
      .order('created_at', { ascending: false })
      .limit(500);
    if (profErr) pageError(profErr.message);
    setProfiles((data ?? []) as ProfileRow[]);
  }, [isSuperAdmin, myProjectRole, supabase]);

  const loadPricing = useCallback(async () => {
    if (!project || !isSuperAdmin) return;
    setPricingLoading(true);
    const { data, error: priceErr } = await supabase
      .from('projects')
      .select(
        'pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
      )
      .eq('id', project.id)
      .maybeSingle();
    if (priceErr) pageError(priceErr.message);
    const row = data as Record<string, unknown> | null;
    if (row) {
      setPricingGstReg(Boolean(row.pricing_gst_registered));
      setPricingGstPct(String(row.pricing_gst_percent ?? '0'));
      setPricingStampPct(String(row.pricing_stamp_duty_percent ?? '0'));
      setPricingRegFee(String(row.pricing_registration_fee ?? '0'));
    }
    setPricingLoading(false);
  }, [isSuperAdmin, project, supabase]);

  useEffect(() => {
    if (!open || !project) return;
        setTab('details');
    resetFromProject(project);
    setLoading(true);
    void (async () => {
      await loadExistingProjects();
      await loadMembers();
      await loadPricing();
      setLoading(false);
    })();
  }, [open, project, resetFromProject, loadExistingProjects, loadMembers, loadPricing]);

  useEffect(() => {
    if (!open) return;
    void loadProfiles();
  }, [open, loadProfiles, isSuperAdmin, myProjectRole]);

  async function saveDetails() {
    if (!project || !canEditDetails) return;
    const parsed = detailsValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
        try {
      const { error: updateErr } = await supabase
        .from('projects')
        .update({
          name: parsed.data.name.trim(),
          location: location.trim() || null,
          type,
          status,
          fy: fy.trim() || null,
          rera_no: isReadyProjectType(type) ? reraNo.trim() || null : null,
          base_rate: baseRate.trim() ? Number(baseRate) || null : null
        })
        .eq('id', project.id);
      if (updateErr) {
        if (updateErr.code === '23505') {
          throw new Error(PROJECT_NAME_DUPLICATE_ERROR);
        }
        throw updateErr;
      }
      onUpdated();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  async function savePricing() {
    if (!project || !canEditPricing) return;
    const parsed = pricingValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
        try {
      const { error: updateErr } = await supabase
        .from('projects')
        .update({
          pricing_gst_registered: pricingGstReg,
          pricing_gst_percent: Number(pricingGstPct) || 0,
          pricing_stamp_duty_percent: Number(pricingStampPct) || 0,
          pricing_registration_fee: Number(pricingRegFee) || 0
        })
        .eq('id', project.id);
      if (updateErr) throw updateErr;
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save pricing');
    } finally {
      setSaving(false);
    }
  }

  async function upsertMember(userId: string, role: string, memberStatus: string) {
    if (!project) return;
        const res = await fetch('/api/crm/admin/project-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        userId,
        role,
        status: memberStatus
      })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) pageError(json.error || 'Failed to update member');
    await loadMembers();
    onUpdated();
  }

  async function removeMember(userId: string) {
    if (!project) return;
        const res = await fetch('/api/crm/admin/project-members', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, userId })
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) pageError(json.error || 'Failed to remove member');
    await loadMembers();
    onUpdated();
  }

  const tabs = useMemo(() => {
    const items: { id: ManageTab; label: string }[] = [
      { id: 'details', label: 'Details' },
      { id: 'members', label: 'Members' }
    ];
    if (canEditPricing) items.push({ id: 'pricing', label: 'Pricing' });
    return items;
  }, [canEditPricing]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,42rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-ds-gray-100 px-4 py-4 sm:px-6">
          <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
            {project.name}
          </DialogTitle>
          <p className="text-left text-xs text-ds-gray-500">
            {project.location || 'No location'} · {project.wing_count} wing
            {project.wing_count !== 1 ? 's' : ''} · {project.unit_count} unit
            {project.unit_count !== 1 ? 's' : ''}
          </p>
        </DialogHeader>

        <ManageTabs tabs={tabs} active={tab} onChange={setTab} />

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">

          {loading ? <p className="text-sm text-ds-gray-500">Loading…</p> : null}

          {!loading && tab === 'details' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1 sm:col-span-2">
                <TextInputField
                  label="Project name"
                  required
                  labelClassName="text-xs text-ds-gray-500"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    detailsValidation.touch('name');
                  }}
                  onBlur={() => detailsValidation.touch('name')}
                  error={detailsValidation.fieldError('name')}
                  disabled={!canEditDetails}
                />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <TextInputField
                  label="Location"
                  labelClassName="text-xs text-ds-gray-500"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={!canEditDetails}
                />
              </div>
              <Field label="Type">
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setType(v);
                    setFy((prev) => coerceProjectFy(v, prev));
                    if (!isReadyProjectType(v)) setReraNo('');
                  }}
                  disabled={!canEditDetails}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onValueChange={setStatus} disabled={!canEditDetails}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Financial year">
                <ProjectFySelect
                  projectType={type}
                  value={fy}
                  onValueChange={setFy}
                  disabled={!canEditDetails}
                />
              </Field>
              {isReadyProjectType(type) ? (
                <Field label="RERA number">
                  <Input
                    value={reraNo}
                    onChange={(e) => setReraNo(e.target.value)}
                    disabled={!canEditDetails}
                    required
                  />
                  <FormFieldError
                    message={detailsValidation.fieldError('rera_no')}
                  />
                </Field>
              ) : null}
              <Field label="Base rate (₹/sq.ft)">
                <Input
                  type="number"
                  min={0}
                  value={baseRate}
                  onChange={(e) => setBaseRate(e.target.value)}
                  disabled={!canEditDetails}
                />
              </Field>
              {!canEditDetails ? (
                <p className="sm:col-span-2 text-xs text-ds-gray-500">
                  Only Super Admin can edit project details.
                </p>
              ) : (
                <SaveRow
                  saving={saving}
                  label="Save details"
                  onSave={() => void saveDetails()}
                />
              )}
            </div>
          ) : null}

          {!loading && tab === 'members' ? (
            <MembersPanel
              canManageMembers={canManageMembers}
              members={members}
              profiles={profiles}
              addMemberPickerKey={addMemberPickerKey}
              onUpsert={upsertMember}
              onRemove={removeMember}
              onAdd={(uid) => {
                void upsertMember(uid, 'Member', 'Active');
                setAddMemberPickerKey((k) => k + 1);
              }}
            />
          ) : null}

          {!loading && tab === 'pricing' && canEditPricing ? (
            <PricingPanel
              loading={pricingLoading}
              gstReg={pricingGstReg}
              gstPct={pricingGstPct}
              stampPct={pricingStampPct}
              regFee={pricingRegFee}
              saving={saving}
              onGstReg={setPricingGstReg}
              onGstPct={setPricingGstPct}
              onStampPct={setPricingStampPct}
              onRegFee={setPricingRegFee}
              onSave={() => void savePricing()}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageTabs({
  tabs,
  active,
  onChange
}: {
  tabs: { id: ManageTab; label: string }[];
  active: ManageTab;
  onChange: (t: ManageTab) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-ds-gray-100 px-4 sm:px-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'min-h-10 px-3 text-sm font-medium transition-colors',
            active === t.id
              ? 'border-b-2 border-ds-primary-500 text-ds-primary-700'
              : 'text-ds-gray-500 hover:text-ds-gray-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-ds-gray-500">{label}</Label>
      {children}
    </div>
  );
}

function SaveRow({
  saving,
  label,
  onSave
}: {
  saving: boolean;
  label: string;
  onSave: () => void;
}) {
  return (
    <div className="sm:col-span-2">
      <Button type="button" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : label}
      </Button>
    </div>
  );
}

function MembersPanel({
  canManageMembers,
  members,
  profiles,
  addMemberPickerKey,
  onUpsert,
  onRemove,
  onAdd
}: {
  canManageMembers: boolean;
  members: ProjectMemberRow[];
  profiles: ProfileRow[];
  addMemberPickerKey: number;
  onUpsert: (userId: string, role: string, status: string) => void;
  onRemove: (userId: string) => void;
  onAdd: (userId: string) => void;
}) {
  return (
    <div>
      {!canManageMembers ? (
        <p className="text-sm text-ds-gray-500">
          Only Super Admin or this project&apos;s Manager can change members.
        </p>
      ) : null}

      <div className="mt-2 overflow-auto rounded-lg border border-ds-gray-100">
        <table className="min-w-[480px] w-full text-sm">
          <thead className="bg-ds-gray-50 text-xs text-ds-gray-500">
            <tr>
              {['User', 'Role', 'Status', ''].map((h) => (
                <th key={h || 'actions'} className="px-3 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const prof = profiles.find((p) => p.id === m.user_id);
              return (
                <tr key={m.user_id} className="border-t border-ds-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ds-gray-900">
                      {prof?.name || 'Unknown user'}
                    </div>
                    {prof?.role ? (
                      <div className="text-xs text-ds-gray-500">{prof.role}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {canManageMembers ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => onUpsert(m.user_id, v, m.status)}
                      >
                        <SelectTrigger size="sm" className="h-8 min-w-[110px]">
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
                  <td className="px-3 py-2">
                    {canManageMembers ? (
                      <Select
                        value={m.status}
                        onValueChange={(v) => onUpsert(m.user_id, m.role, v)}
                      >
                        <SelectTrigger size="sm" className="h-8 min-w-[110px]">
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
                    {canManageMembers ? (
                      <Button size="sm" variant="outline" onClick={() => onRemove(m.user_id)}>
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
                <td colSpan={4} className="px-3 py-8 text-center text-ds-gray-500">
                  No members yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canManageMembers ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-ds-gray-900">Add member</div>
          <SearchableSelect
            key={addMemberPickerKey}
            value=""
            onValueChange={(label) => {
              const user = profiles
                .filter((p) => !members.some((m) => m.user_id === p.id))
                .find(
                  (p) =>
                    `${p.name || 'Unnamed user'} (${p.role})` === label
                );
              if (user) onAdd(user.id);
            }}
            options={profiles
              .filter((p) => !members.some((m) => m.user_id === p.id))
              .map((p) => `${p.name || 'Unnamed user'} (${p.role})`)}
            placeholder="Select user…"
            searchPlaceholder="Search user…"
            className="mt-2 w-full max-w-md"
          />
          <p className="mt-2 text-xs text-ds-gray-500">
            Invite new users from Users first if needed.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PricingPanel({
  loading,
  gstReg,
  gstPct,
  stampPct,
  regFee,
  saving,
  onGstReg,
  onGstPct,
  onStampPct,
  onRegFee,
  onSave
}: {
  loading: boolean;
  gstReg: boolean;
  gstPct: string;
  stampPct: string;
  regFee: string;
  saving: boolean;
  onGstReg: (v: boolean) => void;
  onGstPct: (v: string) => void;
  onStampPct: (v: string) => void;
  onRegFee: (v: string) => void;
  onSave: () => void;
}) {
  if (loading) {
    return <p className="text-sm text-ds-gray-500">Loading pricing…</p>;
  }
  return (
    <>
      <p className="text-xs text-ds-gray-500">
        Defaults for booking cost sheets and quotations.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={gstReg} onCheckedChange={(v) => onGstReg(Boolean(v))} />
          GST registered (apply GST line)
        </label>
        <Field label="GST %">
          <Input type="number" min={0} step={0.1} value={gstPct} onChange={(e) => onGstPct(e.target.value)} />
        </Field>
        <Field label="Stamp duty % (of basic agreement value)">
          <Input
            type="number"
            min={0}
            step={0.1}
            value={stampPct}
            onChange={(e) => onStampPct(e.target.value)}
          />
        </Field>
        <Field label="Registration fee (INR, flat)">
          <Input type="number" min={0} value={regFee} onChange={(e) => onRegFee(e.target.value)} />
        </Field>
      </div>
      <Button className="mt-4" type="button" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save pricing'}
      </Button>
    </>
  );
}
