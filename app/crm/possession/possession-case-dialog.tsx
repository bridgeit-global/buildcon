'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  mergePossessionChecklist,
  parsePossessionSnagList,
  POSSESSION_TRACKER_LABELS,
  toggleChecklistItem,
  type PossessionChecklistItem,
  type PossessionSnagItem,
  type PossessionTrackerId
} from '@/lib/possession/possession-trackers';
import { pageError, toast } from '@/lib/toast';
import { possessionSnagSchema } from '@/lib/possession/possession-case.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { normalizeUnitStatusCode, statusLabelForUnit } from '../inventory/unit-status';
import type { PossessionListRow } from './possession-list-table';

type PossessionCaseDialogProps = {
  row: PossessionListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function PossessionCaseDialog({
  row,
  open,
  onOpenChange,
  onSaved
}: PossessionCaseDialogProps) {
  const [checklist, setChecklist] = useState<PossessionChecklistItem[]>([]);
  const [snags, setSnags] = useState<PossessionSnagItem[]>([]);
  const [notes, setNotes] = useState('');
  const [newSnag, setNewSnag] = useState('');
  const [saving, setSaving] = useState(false);
  const [handingKeys, setHandingKeys] = useState(false);

  const snagValidation = useFieldValidation(possessionSnagSchema, {
    description: newSnag
  });

  useEffect(() => {
    if (!row || !open) return;
    setChecklist(mergePossessionChecklist(row.checklist));
    setNewSnag('');
    void (async () => {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const { data, error: loadErr } = await supabase
        .from('possession_cases')
        .select('checklist, snag_list, notes')
        .eq('id', row.caseId)
        .maybeSingle();
      if (loadErr) {
        toast.error({ title: 'Could not load case', description: loadErr.message });
        return;
      }
      if (data) {
        setChecklist(mergePossessionChecklist(data.checklist));
        setSnags(parsePossessionSnagList(data.snag_list));
        setNotes(typeof data.notes === 'string' ? data.notes : '');
      }
    })();
  }, [row, open]);

  const persist = useCallback(
    async (payload: {
      checklist?: PossessionChecklistItem[];
      snagList?: PossessionSnagItem[];
      notes?: string | null;
    }) => {
      if (!row) return false;
      setSaving(true);
      const res = await fetch(`/api/crm/possession/${row.caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setSaving(false);
      if (!res.ok) {
        toast.error({ title: 'Save failed', description: json.error });
        return false;
      }
      onSaved();
      return true;
    },
    [row, onSaved]
  );

  const recordKeyHandover = useCallback(async () => {
    if (!row) return false;
    setHandingKeys(true);
    const res = await fetch(`/api/crm/possession/${row.caseId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'Handover' })
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setHandingKeys(false);
    if (!res.ok) {
      toast.error({
        title: 'Could not record key handover',
        description: json.error
      });
      return false;
    }
    toast.success('Keys handed over — unit marked as Possession given');
    onSaved();
    return true;
  }, [row, onSaved]);

  const possessed =
    row != null && normalizeUnitStatusCode(row.unitStatus) === 'POSSESSED';

  const onToggleTracker = async (id: PossessionTrackerId, checked: boolean) => {
    const next = toggleChecklistItem(checklist, id, checked);
    setChecklist(next);
    const ok = await persist({ checklist: next, snagList: snags, notes });
    if (!ok) {
      setChecklist(checklist);
      return;
    }
    if (id === 'key_handover' && checked && !possessed) {
      const handed = await recordKeyHandover();
      if (handed) onOpenChange(false);
    }
  };

  const onAddSnag = async () => {
    const parsed = snagValidation.validate();
    if (!parsed.success) {
      pageError('Enter a snag description.');
      return;
    }
    const description = parsed.data.description.trim();
    const next: PossessionSnagItem[] = [
      ...snags,
      {
        id: crypto.randomUUID(),
        description,
        status: 'open',
        createdAt: new Date().toISOString()
      }
    ];
    setSnags(next);
    setNewSnag('');
    const ok = await persist({ checklist, snagList: next, notes });
    if (!ok) setSnags(snags);
  };

  const onRemoveSnag = async (id: string) => {
    const next = snags.filter((s) => s.id !== id);
    setSnags(next);
    const ok = await persist({ checklist, snagList: next, notes });
    if (!ok) setSnags(snags);
  };

  const onSaveNotes = async () => {
    await persist({ checklist, snagList: snags, notes });
  };

  const onKeysHandedOver = async () => {
    if (!row) return;
    const keyDone = toggleChecklistItem(checklist, 'key_handover', true);
    setChecklist(keyDone);
    const ok = await persist({ checklist: keyDone, snagList: snags, notes });
    if (!ok) return;
    const handed = await recordKeyHandover();
    if (handed) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row?.unitCode ?? 'Unit'} — Possession & handover
          </DialogTitle>
          <DialogDescription>
            {row?.customerName ?? '—'} · {row?.projectName ?? '—'} ·{' '}
            {row ? statusLabelForUnit(row.unitStatus) : '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
              Handover trackers
            </h3>
            <ul className="space-y-2">
              {(Object.keys(POSSESSION_TRACKER_LABELS) as PossessionTrackerId[]).map(
                (id) => {
                  const item = checklist.find((c) => c.id === id);
                  const done = item?.done ?? false;
                  return (
                    <li
                      key={id}
                      className="flex items-start gap-3 rounded-lg border border-ds-gray-100 px-3 py-2.5"
                    >
                      <Checkbox
                        id={`tracker-${id}`}
                        checked={done}
                        disabled={saving || possessed}
                        onCheckedChange={(v) =>
                          void onToggleTracker(id, v === true)
                        }
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`tracker-${id}`}
                        className="cursor-pointer text-sm font-medium text-ds-gray-800"
                      >
                        {POSSESSION_TRACKER_LABELS[id]}
                      </Label>
                    </li>
                  );
                }
              )}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
              Snag list
            </h3>
            <ul className="mb-2 space-y-1.5">
              {snags.length === 0 ? (
                <li className="text-sm text-ds-gray-500">No snags logged yet.</li>
              ) : (
                snags.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-ds-gray-50 px-2 py-1.5 text-sm"
                  >
                    <span
                      className={cn(
                        s.status === 'resolved' && 'text-ds-gray-400 line-through'
                      )}
                    >
                      {s.description}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-ds-gray-500"
                      disabled={saving}
                      onClick={() => void onRemoveSnag(s.id)}
                      aria-label="Remove snag"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
            <div className="flex gap-2">
              <Input
                placeholder="Add snag item…"
                value={newSnag}
                onChange={(e) => {
                  setNewSnag(e.target.value);
                  snagValidation.touch('description');
                }}
                onBlur={() => snagValidation.touch('description')}
                aria-invalid={
                  snagValidation.fieldError('description') ? true : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onAddSnag();
                  }
                }}
                disabled={saving}
              />
              <FormFieldError message={snagValidation.fieldError('description')} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={saving || !newSnag.trim()}
                onClick={() => void onAddSnag()}
                aria-label="Add snag"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </section>

          <section>
            <Label htmlFor="possession-notes" className="text-xs font-semibold uppercase text-ds-gray-500">
              Notes
            </Label>
            <Textarea
              id="possession-notes"
              className="mt-1.5 min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void onSaveNotes()}
              disabled={saving}
              placeholder="Internal notes for this handover…"
            />
          </section>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          {!possessed ? (
            <Button
              type="button"
              className="min-h-11 w-full gap-2 bg-ds-primary-500 hover:bg-ds-primary-600"
              disabled={handingKeys || saving}
              onClick={() => void onKeysHandedOver()}
            >
              {handingKeys ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="size-4" aria-hidden />
              )}
              Keys handed to customer
            </Button>
          ) : (
            <p className="text-center text-sm text-ds-primary-700">
              Unit marked as Possession given.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
