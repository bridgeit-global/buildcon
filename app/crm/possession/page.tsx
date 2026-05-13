'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type CaseRow = {
  id: string;
  unit_id: string;
  booking_id: string | null;
  workflow_stage: string;
  snag_list: unknown;
  checklist: unknown;
  keys_handed_over_at: string | null;
};

const WORKFLOW = [
  'OC',
  'FinalDemand',
  'PossessionLetter',
  'Handover',
  'Closed'
] as const;

export default function PossessionPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [units, setUnits] = useState<{ id: string; unit_code: string }[]>([]);
  const [bookings, setBookings] = useState<
    { id: string; unit_id: string; customer_id: string }[]
  >([]);
  const [unitId, setUnitId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeProjectId) {
      setCases([]);
      setUnits([]);
      setBookings([]);
      return;
    }
    setLoading(true);
    setError('');
    const [cRes, uRes, bRes] = await Promise.all([
      supabase
        .from('possession_cases')
        .select(
          'id,unit_id,booking_id,workflow_stage,snag_list,checklist,keys_handed_over_at'
        )
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: false }),
      supabase
        .from('units')
        .select('id,unit_code')
        .eq('project_id', activeProjectId)
        .order('unit_code', { ascending: true })
        .limit(500),
      supabase
        .from('bookings')
        .select('id,unit_id,customer_id')
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: false })
        .limit(200)
    ]);
    if (cRes.error) setError(cRes.error.message);
    if (uRes.error) setError(uRes.error.message);
    if (bRes.error) setError(bRes.error.message);
    setCases((cRes.data ?? []) as CaseRow[]);
    setUnits((uRes.data ?? []) as { id: string; unit_code: string }[]);
    setBookings(
      (bRes.data ?? []) as { id: string; unit_id: string; customer_id: string }[]
    );
    setLoading(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCase() {
    if (!activeProjectId || !unitId) return;
    setSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.from('possession_cases').insert({
        project_id: activeProjectId,
        unit_id: unitId,
        booking_id: bookingId.trim() || null,
        workflow_stage: 'OC',
        snag_list: [],
        checklist: [],
        notes: notes.trim() || null
      });
      if (e) throw e;
      setUnitId('');
      setBookingId('');
      setNotes('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create case');
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(caseId: string, stage: string) {
    setSaving(true);
    setError('');
    try {
      const patch: Record<string, unknown> = { workflow_stage: stage };
      if (stage === 'Closed') {
        patch.keys_handed_over_at = new Date().toISOString();
      }
      const { error: e } = await supabase
        .from('possession_cases')
        .update(patch)
        .eq('id', caseId);
      if (e) throw e;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  const unitLabel = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.unit_code]));
    return (id: string) => m.get(id) ?? id;
  }, [units]);

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project for possession tracking.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <Card className="p-4">
        <div className="text-sm font-semibold">New possession case</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Unit</Label>
            <Select value={unitId || undefined} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.unit_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Booking (optional)</Label>
            <Select
              value={bookingId || '__none__'}
              onValueChange={(v) => setBookingId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link booking" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.id.slice(0, 8)}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 grid gap-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <Button
          className="mt-3"
          type="button"
          disabled={saving || !unitId}
          onClick={() => void createCase()}
        >
          {saving ? 'Saving…' : 'Create case'}
        </Button>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold">Cases</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2">Keys</th>
                <th className="px-2 py-2">Advance</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="px-2 py-2 font-medium">
                    {unitLabel(c.unit_id)}
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={c.workflow_stage}
                      onValueChange={(v) => void updateStage(c.id, v)}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-8 w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW.map((w) => (
                          <SelectItem key={w} value={w}>
                            {w}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {c.keys_handed_over_at
                      ? new Date(c.keys_handed_over_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {c.booking_id ? c.booking_id.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-muted-foreground">
                    {loading ? 'Loading…' : 'No possession cases.'}
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
