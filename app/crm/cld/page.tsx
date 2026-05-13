'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StageRow = {
  id: string;
  sort_order: number;
  name: string;
  demand_kind: string;
  demand_value: number;
  slab_label: string | null;
};

type CompletionRow = {
  id: string;
  completed_on: string;
  notes: string | null;
  stage_id: string;
};

export default function CldPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();
  const [stages, setStages] = useState<StageRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('5');
  const [slab, setSlab] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeProjectId) {
      setStages([]);
      setCompletions([]);
      return;
    }
    setLoading(true);
    setError('');
    const [sRes, cRes] = await Promise.all([
      supabase
        .from('project_cld_stages')
        .select('id,sort_order,name,demand_kind,demand_value,slab_label')
        .eq('project_id', activeProjectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cld_stage_completions')
        .select('id,completed_on,notes,stage_id')
        .eq('project_id', activeProjectId)
        .order('completed_on', { ascending: false })
        .limit(100)
    ]);
    if (sRes.error) setError(sRes.error.message);
    if (cRes.error) setError(cRes.error.message);
    setStages((sRes.data ?? []) as StageRow[]);
    setCompletions((cRes.data ?? []) as CompletionRow[]);
    setLoading(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStage() {
    if (!activeProjectId || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const nextOrder =
        stages.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1;
      const { error: e } = await supabase.from('project_cld_stages').insert({
        project_id: activeProjectId,
        sort_order: nextOrder,
        name: name.trim(),
        demand_kind: kind,
        demand_value: Number(value) || 0,
        slab_label: slab.trim() || null
      });
      if (e) throw e;
      setName('');
      setSlab('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save stage');
    } finally {
      setSaving(false);
    }
  }

  async function logCompletion(stageId: string) {
    if (!activeProjectId) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: e } = await supabase.from('cld_stage_completions').insert({
        project_id: activeProjectId,
        stage_id: stageId,
        notes: 'Marked complete from CRM',
        created_by: user?.id ?? null
      });
      if (e) throw e;
      const { error: qErr } = await supabase.from('cld_notification_queue').insert({
        project_id: activeProjectId,
        channel: 'email',
        payload: { stage_id: stageId, kind: 'cld_stage_complete' },
        status: 'pending'
      });
      if (qErr) throw qErr;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log completion');
    } finally {
      setSaving(false);
    }
  }

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to manage CLD stages.
      </Card>
    );
  }

  const stageNameById = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [stages]);

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <Card className="p-4">
        <div className="text-sm font-semibold">Construction-linked stages</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Define slab-linked demand percentages or fixed amounts. Logging a
          completion queues a notification row for downstream automation.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1">
            <Label className="text-xs">Stage name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Kind</Label>
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
            <Label className="text-xs">Value</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Slab label (optional)</Label>
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

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2">Order</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Demand</th>
                <th className="px-2 py-2">Slab</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="px-2 py-2">{s.sort_order}</td>
                  <td className="px-2 py-2 font-medium">{s.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {s.demand_kind === 'percent'
                      ? `${s.demand_value}%`
                      : `₹ ${Number(s.demand_value).toLocaleString('en-IN')}`}
                  </td>
                  <td className="px-2 py-2 text-xs">{s.slab_label ?? '—'}</td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void logCompletion(s.id)}
                    >
                      Log completion
                    </Button>
                  </td>
                </tr>
              ))}
              {stages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-muted-foreground">
                    {loading ? 'Loading…' : 'No CLD stages yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold">Recent completions</div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
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
