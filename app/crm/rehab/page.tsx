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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type RehabMemberRow = {
  id: string;
  name: string;
  old_unit: string | null;
  old_area: number | null;
  carpet_area: number | null;
  floor_pref: string | null;
  status: string;
  created_at: string;
};

type UnitRow = {
  id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  status: string;
  rehab_member_id: string | null;
};

export default function RehabPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [members, setMembers] = useState<RehabMemberRow[]>([]);
  const [mappedUnitsByMemberId, setMappedUnitsByMemberId] = useState<
    Record<string, UnitRow>
  >({});
  const [availableUnits, setAvailableUnits] = useState<UnitRow[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = members.find((m) => m.id === selectedId) ?? null;
  const selectedMapped = selected ? mappedUnitsByMemberId[selected.id] : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    old_unit: '',
    old_area: '',
    carpet_area: '',
    floor_pref: '2nd',
    status: 'Eligible'
  });

  const [mapUnitId, setMapUnitId] = useState('');
  const [mapping, setMapping] = useState(false);

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');

    const { data: mData, error: mErr } = await supabase
      .from('rehab_members')
      .select('id,name,old_unit,old_area,carpet_area,floor_pref,status,created_at')
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (mErr) setError(mErr.message);
    const mRows = (mData ?? []) as RehabMemberRow[];
    setMembers(mRows);
    setSelectedId((prev) => prev ?? mRows[0]?.id ?? null);

    // Mappings are stored on units via rehab_member_id
    if (mRows.length) {
      const ids = mRows.map((m) => m.id);
      const { data: unitData, error: uErr } = await supabase
        .from('units')
        .select(
          'id,unit_code,wing_name,floor,unit_type,status,rehab_member_id'
        )
        .eq('project_id', activeProjectId)
        .in('rehab_member_id', ids);
      if (uErr) setError(uErr.message);
      const map: Record<string, UnitRow> = {};
      (unitData ?? []).forEach((u) => {
        const row = u as UnitRow;
        if (row.rehab_member_id) map[row.rehab_member_id] = row;
      });
      setMappedUnitsByMemberId(map);
    } else {
      setMappedUnitsByMemberId({});
    }

    const { data: avail, error: availErr } = await supabase
      .from('units')
      .select('id,unit_code,wing_name,floor,unit_type,status,rehab_member_id')
      .eq('project_id', activeProjectId)
      .eq('status', 'AVAILABLE')
      .order('wing_name', { ascending: true })
      .order('floor', { ascending: false })
      .order('unit_no', { ascending: true })
      .limit(500);
    if (availErr) setError(availErr.message);
    setAvailableUnits((avail ?? []) as UnitRow[]);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  async function createMember() {
    if (!activeProjectId || !draft.name) return;
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('rehab_members')
        .insert({
          project_id: activeProjectId,
          name: draft.name,
          old_unit: draft.old_unit || null,
          old_area: draft.old_area ? Number(draft.old_area) : null,
          carpet_area: draft.carpet_area ? Number(draft.carpet_area) : null,
          floor_pref: draft.floor_pref || null,
          status: draft.status
        })
        .select('id,name,old_unit,old_area,carpet_area,floor_pref,status,created_at')
        .single();
      if (error) throw error;
      const row = data as RehabMemberRow;
      setMembers((ms) => [row, ...ms]);
      setSelectedId(row.id);
      setOpen(false);
      setDraft({
        name: '',
        old_unit: '',
        old_area: '',
        carpet_area: '',
        floor_pref: '2nd',
        status: 'Eligible'
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create member');
    } finally {
      setSaving(false);
    }
  }

  async function applyMapping() {
    if (!activeProjectId || !selected || !mapUnitId) return;
    setMapping(true);
    setError('');
    try {
      const prev = mappedUnitsByMemberId[selected.id];
      if (prev?.id) {
        const { error } = await supabase
          .from('units')
          .update({ status: 'AVAILABLE', rehab_member_id: null })
          .eq('id', prev.id)
          .eq('project_id', activeProjectId)
          .eq('rehab_member_id', selected.id);
        if (error) throw error;
      }

      const { error: mapErr } = await supabase
        .from('units')
        .update({ status: 'REHAB_RSV', rehab_member_id: selected.id })
        .eq('id', mapUnitId)
        .eq('project_id', activeProjectId)
        .eq('status', 'AVAILABLE');
      if (mapErr) throw mapErr;

      setMapUnitId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to map unit');
    } finally {
      setMapping(false);
    }
  }

  async function clearMapping() {
    if (!activeProjectId || !selected) return;
    setMapping(true);
    setError('');
    try {
      const prev = mappedUnitsByMemberId[selected.id];
      if (!prev) return;
      const { error } = await supabase
        .from('units')
        .update({ status: 'AVAILABLE', rehab_member_id: null })
        .eq('id', prev.id)
        .eq('project_id', activeProjectId)
        .eq('rehab_member_id', selected.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear mapping');
    } finally {
      setMapping(false);
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4">
      <Card className="p-3 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Members</div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading…' : `${members.length} member(s)`}
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add rehab member</DialogTitle>
              </DialogHeader>
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Old unit</Label>
                  <Input
                    value={draft.old_unit}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, old_unit: e.target.value }))
                    }
                    placeholder="A/797"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, status: v }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Eligible">Eligible</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Old area</Label>
                  <Input
                    value={draft.old_area}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, old_area: e.target.value }))
                    }
                    placeholder="807.08"
                  />
                </div>
                <div>
                  <Label>Carpet area</Label>
                  <Input
                    value={draft.carpet_area}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, carpet_area: e.target.value }))
                    }
                    placeholder="467.88"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Floor preference</Label>
                  <Input
                    value={draft.floor_pref}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, floor_pref: e.target.value }))
                    }
                    placeholder="2nd"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={createMember} disabled={saving || !draft.name}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-auto -mx-3 px-3">
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  selectedId === m.id
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 line-clamp-1">
                  {m.name}
                </div>
                <div className="text-xs text-gray-500">
                  {m.status}
                  {mappedUnitsByMemberId[m.id] ? ' · Mapped' : ''}
                </div>
              </button>
            ))}
            {!loading && members.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No members yet.
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Card>

      <Card className="p-5">
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {selected ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {selected.name}
              </div>
              <div className="text-sm text-gray-500">{selected.id}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                ['Old unit', selected.old_unit ?? '—'],
                ['Old area', selected.old_area ?? '—'],
                ['Carpet area', selected.carpet_area ?? '—'],
                ['Floor pref', selected.floor_pref ?? '—'],
                ['Status', selected.status],
                [
                  'Mapped unit',
                  selectedMapped ? selectedMapped.unit_code : 'Not mapped'
                ]
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-gray-500">{k}</div>
                  <div className="text-sm font-semibold text-gray-900">{v}</div>
                </div>
              ))}
            </div>

            <Card className="p-4">
              <div className="text-sm font-semibold text-gray-900">
                Unit mapping
              </div>
              <div className="mt-3 flex flex-wrap gap-3 items-end">
                <div className="min-w-[360px]">
                  <Label>Select available unit</Label>
                  <Select
                    value={mapUnitId === '' ? undefined : mapUnitId}
                    onValueChange={setMapUnitId}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.unit_code} · {u.wing_name} · F{u.floor} ·{' '}
                          {u.unit_type ?? '—'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={applyMapping} disabled={mapping || !mapUnitId}>
                  {mapping ? 'Saving…' : 'Confirm mapping'}
                </Button>
                <Button
                  variant="outline"
                  onClick={clearMapping}
                  disabled={mapping || !selectedMapped}
                >
                  Clear mapping
                </Button>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Mapping sets unit status to <strong>REHAB_RSV</strong> and stores the
                member reference on the unit.
              </div>
            </Card>

            <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              Rent/compensation entries (`rehab_rent_entries`) and rehab document
              generation are next; the schema supports it and can be wired here.
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a member.</div>
        )}
      </Card>
    </div>
  );
}

