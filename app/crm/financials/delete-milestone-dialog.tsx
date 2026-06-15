'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { formatInr } from '../inr-format';

function mergeTargetLabel(s: { instalment_no: number; milestone: string }) {
  return `${s.instalment_no}. ${s.milestone}`;
}

export type DeleteMilestoneSchedule = {
  id: string;
  instalment_no: number;
  milestone: string;
  amount: number;
  received: number;
};

type MergeTarget = {
  id: string;
  instalment_no: number;
  milestone: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: DeleteMilestoneSchedule | null;
  mergeTargets: MergeTarget[];
  loading?: boolean;
  onDeleted: () => void | Promise<void>;
};

export function DeleteMilestoneDialog({
  open,
  onOpenChange,
  schedule,
  mergeTargets,
  loading,
  onDeleted
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mergeToId, setMergeToId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMergeToId(mergeTargets[0]?.id ?? '');
    setDeleting(false);
    setSubmitAttempted(false);
  }, [open, mergeTargets]);

  const received = Math.max(0, schedule?.received ?? 0);
  const returnAmount = Math.round(schedule?.amount ?? 0);
  const mergeTargetLabels = useMemo(
    () => mergeTargets.map((s) => mergeTargetLabel(s)),
    [mergeTargets]
  );

  const selectedMergeTargetLabel = useMemo(() => {
    const row = mergeTargets.find((s) => s.id === mergeToId);
    return row ? mergeTargetLabel(row) : '';
  }, [mergeTargets, mergeToId]);

  const canDelete =
    !loading &&
    !deleting &&
    Boolean(schedule?.id) &&
    received === 0 &&
    returnAmount > 0 &&
    Boolean(mergeToId) &&
    mergeTargets.length > 0;

  async function confirmDelete() {
    setSubmitAttempted(true);
    if (!schedule?.id || !canDelete) {
      pageError(
        received > 0
          ? 'Cannot delete an instalment that already has collections recorded.'
          : 'Select an instalment to return this amount to.'
      );
      return;
    }
    setDeleting(true);
    try {
      const { data: target, error: targetErr } = await supabase
        .from('payment_schedules')
        .select('id, amount')
        .eq('id', mergeToId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) throw new Error('Selected instalment not found.');

      const targetAmount = Number(target.amount || 0);
      const { error: mergeErr } = await supabase
        .from('payment_schedules')
        .update({ amount: targetAmount + returnAmount })
        .eq('id', mergeToId);
      if (mergeErr) throw mergeErr;

      const { error: delErr } = await supabase
        .from('payment_schedules')
        .delete()
        .eq('id', schedule.id);
      if (delErr) throw delErr;

      toast.success('Milestone removed from payment schedule.');
      onOpenChange(false);
      await onDeleted();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to delete milestone');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg border-ds-gray-200 p-0">
        <DialogHeader className="border-b border-ds-gray-100 bg-linear-to-br from-ds-error-50/60 to-white px-4 py-4 sm:px-6">
          <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
            Delete milestone
          </DialogTitle>
          <DialogDescription className="text-left text-xs text-ds-gray-600">
            {schedule
              ? `Remove instalment ${schedule.instalment_no}. ${schedule.milestone} and return its demand to another row.`
              : 'Remove this instalment from the payment schedule.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 sm:px-6">
          {received > 0 ? (
            <p className="text-sm text-ds-error-700">
              This instalment has ₹{' '}
              {formatInr(received, { maximumFractionDigits: 0 })} recorded in collections. Delete
              collections first, or edit the milestone instead.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <p className="text-sm text-ds-gray-700">
                ₹ {formatInr(returnAmount, { maximumFractionDigits: 0 })} will be added back to the
                instalment you select below.
              </p>
              <div className="space-y-1.5">
                <FieldLabel required>Return amount to</FieldLabel>
                <SearchableSelect
                  value={selectedMergeTargetLabel}
                  onValueChange={(label) => {
                    const row = mergeTargets.find(
                      (s) => mergeTargetLabel(s) === label
                    );
                    setMergeToId(row?.id ?? '');
                  }}
                  options={mergeTargetLabels}
                  placeholder="Select an instalment"
                  searchPlaceholder="Search instalment…"
                  disabled={loading || deleting || mergeTargets.length === 0}
                  className="w-full"
                />
                <FormFieldError
                  message={
                    submitAttempted && !mergeToId
                      ? 'Select an instalment to return this amount to.'
                      : undefined
                  }
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-ds-gray-100 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDelete()}
            disabled={!canDelete}
          >
            {deleting ? 'Deleting…' : 'Delete milestone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
