'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const FUNNEL_STAGES = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token',
  'Booking',
  'Won',
  'Lost'
] as const;

type FollowRow = {
  id: string;
  due_at: string;
  note: string | null;
  completed_at: string | null;
};

type VisitRow = {
  id: string;
  scheduled_at: string;
  status: string;
  outcome: string | null;
};

export type OpportunityRow = {
  id: string;
  funnel_stage: string;
  assigned_to: string | null;
  sales_follow_ups?: FollowRow[] | FollowRow | null;
  sales_site_visits?: VisitRow[] | VisitRow | null;
};

function embedList<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export function InquiryPipelineDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  opportunity: OpportunityRow | null;
  onSaved: () => void;
}) {
  const { open, onOpenChange, projectId, opportunity, onSaved } = props;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [stage, setStage] = useState<string>('Enquiry');
  const [assignTo, setAssignTo] = useState<string>('');
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [followDue, setFollowDue] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [visitAt, setVisitAt] = useState('');
  const [visitNotes, setVisitNotes] = useState('');

  useEffect(() => {
    if (!open || !opportunity) return;
    setStage(opportunity.funnel_stage || 'Enquiry');
    setAssignTo(opportunity.assigned_to ?? '');
  }, [open, opportunity]);

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    const { data: memRows, error: mErr } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('status', 'Active');
    if (mErr || !memRows?.length) {
      setMembers([]);
      return;
    }
    const ids = memRows.map((r) => r.user_id as string);
    const { data: profRows, error: pErr } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', ids);
    if (pErr) {
      setMembers(ids.map((id) => ({ user_id: id, name: id })));
      return;
    }
    const nameBy = new Map(
      (profRows ?? []).map((p) => [p.id as string, (p.name as string) || p.id])
    );
    setMembers(
      ids.map((id) => ({ user_id: id, name: nameBy.get(id) ?? id }))
    );
  }, [projectId, supabase]);

  useEffect(() => {
    if (open) void loadMembers();
  }, [open, loadMembers]);

  const followUps = useMemo(
    () =>
      embedList(opportunity?.sales_follow_ups).sort((a, b) =>
        a.due_at < b.due_at ? 1 : -1
      ),
    [opportunity?.sales_follow_ups]
  );

  const visits = useMemo(
    () =>
      embedList(opportunity?.sales_site_visits).sort((a, b) =>
        a.scheduled_at < b.scheduled_at ? 1 : -1
      ),
    [opportunity?.sales_site_visits]
  );

  async function savePipeline() {
    if (!opportunity) return;
    setSaving(true);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('sales_opportunities')
        .update({
          funnel_stage: stage,
          assigned_to: assignTo.trim() ? assignTo.trim() : null
        })
        .eq('id', opportunity.id);
      if (uErr) throw uErr;
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addFollowUp() {
    if (!opportunity || !followDue.trim()) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: fErr } = await supabase.from('sales_follow_ups').insert({
        opportunity_id: opportunity.id,
        due_at: new Date(followDue).toISOString(),
        note: followNote.trim() || null,
        created_by: user?.id ?? null
      });
      if (fErr) throw fErr;
      setFollowDue('');
      setFollowNote('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add follow-up');
    } finally {
      setSaving(false);
    }
  }

  async function addSiteVisit() {
    if (!opportunity || !visitAt.trim()) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: vErr } = await supabase.from('sales_site_visits').insert({
        opportunity_id: opportunity.id,
        scheduled_at: new Date(visitAt).toISOString(),
        status: 'Scheduled',
        notes: visitNotes.trim() || null,
        created_by: user?.id ?? null
      });
      if (vErr) throw vErr;
      setVisitAt('');
      setVisitNotes('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule visit');
    } finally {
      setSaving(false);
    }
  }

  if (!opportunity) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pipeline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No opportunity row is linked to this inquiry yet. Save the inquiry
            again or refresh after migration.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead pipeline</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUNNEL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Assigned to</Label>
            <Select
              value={assignTo || '__unassigned__'}
              onValueChange={(v) =>
                setAssignTo(v === '__unassigned__' ? '' : v)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs font-semibold">Follow-ups</div>
          <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
            {followUps.length === 0 ? (
              <li>None yet.</li>
            ) : (
              followUps.map((f) => (
                <li key={f.id}>
                  {new Date(f.due_at).toLocaleString()}
                  {f.completed_at ? ' · done' : ''}
                  {f.note ? ` — ${f.note}` : ''}
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 grid gap-2">
            <Input
              type="datetime-local"
              value={followDue}
              onChange={(e) => setFollowDue(e.target.value)}
              className="h-9 text-xs"
            />
            <Textarea
              value={followNote}
              onChange={(e) => setFollowNote(e.target.value)}
              placeholder="Note"
              className="min-h-[52px] text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving || !followDue.trim()}
              onClick={() => void addFollowUp()}
            >
              Add follow-up
            </Button>
          </div>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs font-semibold">Site visits</div>
          <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
            {visits.length === 0 ? (
              <li>None scheduled.</li>
            ) : (
              visits.map((v) => (
                <li key={v.id}>
                  {new Date(v.scheduled_at).toLocaleString()} · {v.status}
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 grid gap-2">
            <Input
              type="datetime-local"
              value={visitAt}
              onChange={(e) => setVisitAt(e.target.value)}
              className="h-9 text-xs"
            />
            <Textarea
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              placeholder="Visit notes"
              className="min-h-[44px] text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving || !visitAt.trim()}
              onClick={() => void addSiteVisit()}
            >
              Schedule site visit
            </Button>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void savePipeline()}>
            {saving ? 'Saving…' : 'Save pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
