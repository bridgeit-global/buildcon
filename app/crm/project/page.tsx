'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { CrmProjectCard } from '../_components/crm-project-card';
import type { CrmProjectListItem } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

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
  const [listQ, setListQ] = useState('');
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [addMemberPickerKey, setAddMemberPickerKey] = useState(0);

  const [pricingGstReg, setPricingGstReg] = useState(false);
  const [pricingGstPct, setPricingGstPct] = useState('0');
  const [pricingStampPct, setPricingStampPct] = useState('0');
  const [pricingRegFee, setPricingRegFee] = useState('0');
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);

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
      router.replace('/crm/project/create', { scroll: false });
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

  useEffect(() => {
    if (!activeProjectId || !canCreateProject) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setPricingLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select(
          'pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
        )
        .eq('id', activeProjectId)
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      const row = data as Record<string, unknown> | null;
      if (row) {
        setPricingGstReg(Boolean(row.pricing_gst_registered));
        setPricingGstPct(String(row.pricing_gst_percent ?? '0'));
        setPricingStampPct(String(row.pricing_stamp_duty_percent ?? '0'));
        setPricingRegFee(String(row.pricing_registration_fee ?? '0'));
      }
      setPricingLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, canCreateProject, supabase]);

  async function saveProjectPricing() {
    if (!activeProjectId || !canCreateProject) return;
    setPricingSaving(true);
    setError('');
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          pricing_gst_registered: pricingGstReg,
          pricing_gst_percent: Number(pricingGstPct) || 0,
          pricing_stamp_duty_percent: Number(pricingStampPct) || 0,
          pricing_registration_fee: Number(pricingRegFee) || 0
        })
        .eq('id', activeProjectId);
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pricing');
    } finally {
      setPricingSaving(false);
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
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-bold text-slate-800">Project</div>
            <div className="text-xs text-slate-400">
              Browse sites, pick the active project, invite members, and create new projects.
            </div>
          </div>

          {canCreateProject ? (
            <Button asChild>
              <Link href="/crm/project/create">Create project</Link>
            </Button>
          ) : (
            <Button type="button" disabled>
              Create project
            </Button>
          )}
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
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              upsertMember(m.user_id, v, m.status)
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
                      <td className="px-3 py-2">
                        {canManageMembers ? (
                          <Select
                            value={m.status}
                            onValueChange={(v) =>
                              upsertMember(m.user_id, m.role, v)
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
              <Select
                key={addMemberPickerKey}
                onValueChange={(uid) => {
                  void upsertMember(uid, 'Member', 'Active');
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
                        {p.name || p.id} ({p.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500">
                Tip: use `/crm/users` to invite a new user first.
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {canCreateProject && activeProjectId ? (
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">
            Pricing and tax defaults
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Used on booking cost sheets and quotations (GST on basic + parking,
            stamp duty % of basic, flat registration estimate).
          </p>
          {pricingLoading ? (
            <p className="mt-3 text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pricingGstReg}
                  onCheckedChange={(v) => setPricingGstReg(Boolean(v))}
                />
                GST registered (apply GST line)
              </label>
              <div className="grid gap-1">
                <Label className="text-xs text-gray-500">GST %</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pricingGstPct}
                  onChange={(e) => setPricingGstPct(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-gray-500">
                  Stamp duty % (of basic agreement value)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pricingStampPct}
                  onChange={(e) => setPricingStampPct(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-gray-500">
                  Registration fee (INR, flat)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={pricingRegFee}
                  onChange={(e) => setPricingRegFee(e.target.value)}
                />
              </div>
            </div>
          )}
          <Button
            className="mt-4"
            type="button"
            disabled={pricingSaving || pricingLoading}
            onClick={() => void saveProjectPricing()}
          >
            {pricingSaving ? 'Saving…' : 'Save pricing'}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

