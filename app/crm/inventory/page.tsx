'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type UnitRow = {
  id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_no: number;
  unit_type: string | null;
  area: number | null;
  rate: number | null;
  status: string;
  blocked_reason: string | null;
  blocked_on: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  A: 'Available',
  B: 'Booked',
  S: 'Sold',
  RR: 'Rehab Reserved',
  BL: 'Blocked',
  RF: 'Refugee'
};

const BLOCK_REASONS = [
  'Legal hold',
  'Management reserve',
  'Bank hold',
  'Rehab pipeline',
  'Other'
];

export default function InventoryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<'All' | keyof typeof STATUS_LABEL>(
    'All'
  );

  const [blockUnitId, setBlockUnitId] = useState<string>('');
  const [blockReason, setBlockReason] = useState<string>('');
  const [blocking, setBlocking] = useState(false);

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('units')
      .select(
        'id,unit_code,wing_name,floor,unit_no,unit_type,area,rate,status,blocked_reason,blocked_on'
      )
      .eq('project_id', activeProjectId)
      .order('wing_name', { ascending: true })
      .order('floor', { ascending: false })
      .order('unit_no', { ascending: true });
    if (error) setError(error.message);
    setUnits((data ?? []) as UnitRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const filtered = units.filter((u) => {
    if (statusF !== 'All' && u.status !== statusF) return false;
    if (search && !u.unit_code.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  async function blockSelected() {
    if (!blockUnitId || !blockReason) return;
    setBlocking(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('units')
      .update({
        status: 'BL',
        blocked_reason: blockReason,
        blocked_on: today
      })
      .eq('id', blockUnitId)
      .eq('status', 'A');

    if (error) setError(error.message);
    setBlockUnitId('');
    setBlockReason('');
    await load();
    setBlocking(false);
  }

  async function unblock(unitId: string) {
    setError('');
    const { error } = await supabase
      .from('units')
      .update({
        status: 'A',
        blocked_reason: null,
        blocked_on: null
      })
      .eq('id', unitId)
      .eq('status', 'BL');
    if (error) setError(error.message);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[200px]">
            <Label>Search unit</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by unit code…"
            />
          </div>
          <div className="min-w-[180px]">
            <Label>Status</Label>
            <select
              value={statusF}
              onChange={(e) => setStatusF(e.target.value as typeof statusF)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="All">All</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-900">Block a unit</div>
        <div className="mt-3 flex flex-wrap gap-3 items-end">
          <div className="min-w-[260px]">
            <Label>Unit</Label>
            <select
              value={blockUnitId}
              onChange={(e) => setBlockUnitId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select available unit…</option>
              {units
                .filter((u) => u.status === 'A')
                .slice(0, 500)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code} — {u.unit_type ?? '—'}
                  </option>
                ))}
            </select>
          </div>
          <div className="min-w-[240px]">
            <Label>Reason</Label>
            <select
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select reason…</option>
              {BLOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={blockSelected}
            disabled={blocking || !blockUnitId || !blockReason}
          >
            {blocking ? 'Blocking…' : 'Block'}
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Units</div>
            <div className="text-xs text-gray-500">{filtered.length} unit(s)</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {[
                  'Unit',
                  'Wing',
                  'Floor',
                  'Type',
                  'Area',
                  'Rate',
                  'Status',
                  'Blocked reason',
                  'Action'
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-semibold border-b"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {u.unit_code}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.wing_name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.floor}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.unit_type ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.area ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.rate != null ? `₹ ${u.rate.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-1 text-xs">
                      {STATUS_LABEL[u.status] ?? u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.blocked_reason ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.status === 'BL' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unblock(u.id)}
                      >
                        Unblock
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    No units found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

