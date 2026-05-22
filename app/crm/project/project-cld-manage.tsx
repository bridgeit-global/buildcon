'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StageRow = {
  id: string;
  project_id: string;
  sort_order: number;
  name: string;
  demand_kind: string;
  demand_value: number;
  slab_label: string | null;
};

type CompletionRow = {
  id: string;
  project_id: string;
  completed_on: string;
  notes: string | null;
  stage_id: string;
};

export function ProjectCldManage({
  projectId,
  projectName
}: {
  projectId: string;
  projectName?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('5');
  const [slab, setSlab] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
        const [sRes, cRes] = await Promise.all([
      supabase
        .from('project_cld_stages')
        .select('id,project_id,sort_order,name,demand_kind,demand_value,slab_label')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cld_stage_completions')
        .select('id,project_id,completed_on,notes,stage_id')
        .eq('project_id', projectId)
        .order('completed_on', { ascending: false })
        .limit(100)
    ]);
    if (sRes.error) pageError(sRes.error.message);
    if (cRes.error) pageError(cRes.error.message);
    setStages((sRes.data ?? []) as StageRow[]);
    setCompletions((cRes.data ?? []) as CompletionRow[]);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStage() {
    if (!projectId || !name.trim()) return;
    setSaving(true);
        try {
      const nextOrder =
        stages.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1;
      const { error: e } = await supabase.from('project_cld_stages').insert({
        project_id: projectId,
        sort_order: nextOrder,
        name: name.trim(),
        demand_kind: kind,
        demand_value: Number(value) || 0,
        slab_label: slab.trim() || null
      });
      if (e) throw e;
      setName('');
      setSlab('');
      const syncRes = await fetch(
        `/api/crm/projects/${encodeURIComponent(projectId)}/cld/sync-schedules`,
        { method: 'POST', credentials: 'same-origin' }
      );
      if (!syncRes.ok) {
        const syncJson = (await syncRes.json()) as { error?: string };
        throw new Error(
          syncJson.error ?? 'Stage saved but payment schedules could not be updated'
        );
      }
      const syncJson = (await syncRes.json()) as {
        bookingsProcessed?: number;
        schedulesUpdated?: number;
      };
      const n = syncJson.schedulesUpdated ?? 0;
      if (n > 0) {
        setSuccess(
          `CLD stage added. Payment schedules updated for ${n} booking unit${n === 1 ? '' : 's'}.`
        );
      }
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save stage');
    } finally {
      setSaving(false);
    }
  }

  async function logCompletion(stage: StageRow) {
    setSaving(true);
        setSuccess('');
    try {
      const res = await fetch(
        `/api/crm/projects/${encodeURIComponent(stage.project_id)}/cld/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageId: stage.id })
        }
      );
      const json = (await res.json()) as {
        error?: string;
        bookingsProcessed?: number;
        schedulesUpdated?: number;
        demandLettersGenerated?: number;
        demandLettersSkipped?: number;
        demandLetterErrors?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Failed to log completion');
      const n = json.bookingsProcessed ?? 0;
      const generated = json.demandLettersGenerated ?? 0;
      const skipped = json.demandLettersSkipped ?? 0;
      const demandNote =
        generated > 0
          ? ` Demand letter PDFs created for ${generated} confirmed booking${generated === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped — already issued or fully paid)` : ''}.`
          : n > 0
            ? ' No new demand PDFs (instalments may already be paid or letters already on file).'
            : '';
      const errNote =
        json.demandLetterErrors?.length
          ? ` Some units failed: ${json.demandLetterErrors.slice(0, 2).join('; ')}${json.demandLetterErrors.length > 2 ? '…' : ''}`
          : '';
      setSuccess(
        n > 0
          ? `Stage completed. Payment milestones updated for ${n} booking unit${n === 1 ? '' : 's'}.${demandNote} Review under Agreements & documents or Financials.${errNote}`
          : `Stage completed. No active bookings yet; milestones will apply when units are booked.${demandNote}`
      );
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to log completion');
    } finally {
      setSaving(false);
    }
  }

  const stageNameById = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [stages]);

  return (
    <div className="flex flex-col gap-4">
      {success ? (
        <div className="rounded-md border border-ds-primary-200 bg-ds-primary-50 p-3 text-sm text-ds-primary-800">
          {success}
        </div>
      ) : null}
      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="text-sm font-semibold text-ds-gray-900">
          Construction-linked stages
          {projectName ? (
            <span className="font-normal text-ds-gray-500"> · {projectName}</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Define slab-linked demand percentages or fixed amounts. When you log a stage
          completion, the matching instalment is activated on every active booking (due
          date set to today) so finance can generate demand letters and post collections
          under Financials.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs text-ds-gray-500">Stage name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-ds-gray-500">Kind</Label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed INR</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-ds-gray-500">Value</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid gap-1 sm:col-span-2 lg:col-span-4">
            <Label className="text-xs text-ds-gray-500">Slab label (optional)</Label>
            <Input value={slab} onChange={(e) => setSlab(e.target.value)} />
          </div>
        </div>
        <Button
          className="mt-3"
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => void addStage()}
        >
          {saving ? 'Saving…' : 'Add stage'}
        </Button>

        <div className="mt-6 overflow-x-auto rounded-lg border border-ds-gray-100">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-ds-gray-100 bg-ds-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-ds-gray-500">
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Demand</th>
                <th className="px-3 py-2">Slab</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id} className="border-b border-ds-gray-100">
                  <td className="px-3 py-2 tabular-nums">{s.sort_order}</td>
                  <td className="px-3 py-2 font-medium text-ds-gray-900">{s.name}</td>
                  <td className="px-3 py-2 text-ds-gray-600">
                    {s.demand_kind === 'percent'
                      ? `${s.demand_value}%`
                      : `₹ ${Number(s.demand_value).toLocaleString('en-IN')}`}
                  </td>
                  <td className="px-3 py-2 text-xs text-ds-gray-600">
                    {s.slab_label ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void logCompletion(s)}
                    >
                      Log completion
                    </Button>
                  </td>
                </tr>
              ))}
              {stages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-ds-gray-500">
                    {loading ? 'Loading…' : 'No CLD stages yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="text-sm font-semibold text-ds-gray-900">Recent completions</div>
        <ul className="mt-2 space-y-1 text-xs text-ds-gray-600">
          {completions.map((c) => (
            <li key={c.id}>
              {c.completed_on} · {stageNameById.get(c.stage_id) ?? c.stage_id}
              {c.notes ? ` — ${c.notes}` : ''}
            </li>
          ))}
          {completions.length === 0 ? <li>None yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}