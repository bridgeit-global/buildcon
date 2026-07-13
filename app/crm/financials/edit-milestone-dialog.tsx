'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InrAmountInput } from '@/components/ui/inr-amount-input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
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

function instalmentAdjustLabel(
  s: { instalment_no: number; milestone: string; balance?: number },
  includePending: boolean
) {
  let label = `${s.instalment_no}. ${s.milestone}`;
  if (includePending && s.balance != null) {
    label += ` · ₹ ${formatInr(Math.round(Math.max(0, s.balance)), {
      maximumFractionDigits: 0
    })} pending`;
  }
  return label;
}

export type EditMilestoneSchedule = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
  received: number;
  balance: number;
};

type InstalmentOption = {
  id: string;
  instalment_no: number;
  milestone: string;
  balance?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  schedule: EditMilestoneSchedule | null;
  /** Instalments with pending balance (for amount increases). */
  takeFromSchedules: InstalmentOption[];
  /** Other instalments on the booking (for amount decreases). */
  returnToSchedules: InstalmentOption[];
  loading?: boolean;
  onSaved: () => void | Promise<void>;
};

export function EditMilestoneDialog({
  open,
  onOpenChange,
  bookingId,
  schedule,
  takeFromSchedules,
  returnToSchedules,
  loading,
  onSaved
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [milestone, setMilestone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [adjustScheduleId, setAdjustScheduleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!open || !schedule) return;
    setMilestone(schedule.milestone);
    setDueDate(schedule.due_date ?? '');
    setAmount(String(Math.round(schedule.amount || 0)));
    setSaving(false);
    setSubmitAttempted(false);
  }, [open, schedule]);

  const milestoneTrim = milestone.trim();
  const amountNum = Number(amount);
  const received = Math.max(0, schedule?.received ?? 0);
  const oldAmount = Math.round(schedule?.amount ?? 0);
  const delta =
    Number.isFinite(amountNum) && schedule ? Math.round(amountNum) - oldAmount : 0;
  const adjustOptions = delta > 0 ? takeFromSchedules : returnToSchedules;

  const adjustScheduleLabels = useMemo(
    () => adjustOptions.map((s) => instalmentAdjustLabel(s, delta > 0)),
    [adjustOptions, delta]
  );

  const selectedAdjustLabel = useMemo(() => {
    const row = adjustOptions.find((s) => s.id === adjustScheduleId);
    return row ? instalmentAdjustLabel(row, delta > 0) : '';
  }, [adjustOptions, adjustScheduleId, delta]);

  useEffect(() => {
    if (!open || !schedule) return;
    const opts = delta > 0 ? takeFromSchedules : returnToSchedules;
    setAdjustScheduleId((prev) =>
      opts.some((o) => o.id === prev) ? prev : (opts[0]?.id ?? '')
    );
  }, [open, schedule, delta, takeFromSchedules, returnToSchedules]);
  const needsAdjust = delta !== 0;
  const adjustFrom = adjustOptions.find((s) => s.id === adjustScheduleId) ?? null;
  const adjustBalance = Math.max(0, adjustFrom?.balance ?? 0);
  const amountBelowReceived = Number.isFinite(amountNum) && amountNum < received;
  const amountIncreaseExceedsAdjust =
    delta > 0 && Number.isFinite(amountNum) && delta > adjustBalance;

  function fieldError(
    field: 'milestone' | 'amount' | 'adjustScheduleId'
  ): string | undefined {
    if (!submitAttempted) return undefined;
    if (field === 'milestone' && !milestoneTrim) {
      return 'Milestone name is required.';
    }
    if (field === 'amount') {
      if (!Number.isFinite(amountNum)) return 'Enter a valid amount.';
      if (amountBelowReceived) {
        return `Amount cannot be less than received (₹ ${Math.round(received)}).`;
      }
      if (amountIncreaseExceedsAdjust) {
        return `Increase cannot exceed selected instalment pending (₹ ${Math.round(
          adjustBalance
        )}).`;
      }
    }
    if (field === 'adjustScheduleId' && needsAdjust && !adjustScheduleId) {
      return 'Select an instalment for the adjustment.';
    }
    return undefined;
  }

  const canSave =
    !loading &&
    !saving &&
    Boolean(bookingId) &&
    Boolean(schedule?.id) &&
    milestoneTrim.length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum >= received &&
    !amountBelowReceived &&
    (!needsAdjust || Boolean(adjustScheduleId)) &&
    (!needsAdjust || delta <= 0 || !amountIncreaseExceedsAdjust);

  async function save() {
    setSubmitAttempted(true);
    if (!schedule?.id || !canSave) {
      pageError(
        amountBelowReceived
          ? `Amount cannot be less than received (₹ ${Math.round(received)}).`
          : amountIncreaseExceedsAdjust
            ? `Increase cannot exceed selected instalment pending (₹ ${Math.round(
              adjustBalance
            )}).`
            : 'Enter a milestone name and a valid amount.'
      );
      return;
    }
    setSaving(true);
    try {
      const newAmount = Math.round(amountNum);

      if (delta > 0) {
        const { data: donor, error: donorErr } = await supabase
          .from('payment_schedules')
          .select('id, amount')
          .eq('id', adjustScheduleId)
          .maybeSingle();
        if (donorErr) throw donorErr;
        if (!donor) throw new Error('Selected instalment not found.');
        const donorAmount = Number(donor.amount || 0);
        const donorNew = donorAmount - delta;
        if (!(Number.isFinite(donorNew) && donorNew >= 0)) {
          throw new Error('Adjustment would make instalment amount negative.');
        }
        const { error: donorUpdErr } = await supabase
          .from('payment_schedules')
          .update({ amount: donorNew })
          .eq('id', adjustScheduleId);
        if (donorUpdErr) throw donorUpdErr;
      } else if (delta < 0) {
        const returnBy = -delta;
        const { data: target, error: targetErr } = await supabase
          .from('payment_schedules')
          .select('id, amount')
          .eq('id', adjustScheduleId)
          .maybeSingle();
        if (targetErr) throw targetErr;
        if (!target) throw new Error('Selected instalment not found.');
        const targetAmount = Number(target.amount || 0);
        const { error: targetUpdErr } = await supabase
          .from('payment_schedules')
          .update({ amount: targetAmount + returnBy })
          .eq('id', adjustScheduleId);
        if (targetUpdErr) throw targetUpdErr;
      }

      const { error: updErr } = await supabase
        .from('payment_schedules')
        .update({
          milestone: milestoneTrim,
          due_date: dueDate || null,
          amount: newAmount
        })
        .eq('id', schedule.id);
      if (updErr) throw updErr;

      toast.success('Milestone updated.');
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update milestone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg border-ds-gray-200 p-0">
        <DialogHeader className="border-b border-ds-gray-100 bg-linear-to-br from-ds-primary-50/80 to-card px-4 py-4 sm:px-6">
          <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
            Edit milestone
          </DialogTitle>
          <DialogDescription className="text-left text-xs text-ds-gray-600">
            Update instalment {schedule?.instalment_no ?? '—'} on this booking’s payment schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-4">
            <TextInputField
              label="Milestone"
              required
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              error={fieldError('milestone')}
              disabled={loading || saving || !schedule}
            />

            <TextInputField
              label="Due date"
              type="date"
              inputClassName="min-w-42 pr-10"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={loading || saving || !schedule}
            />

            <div className="space-y-1.5">
              <FieldLabel required>Amount (₹)</FieldLabel>
              <InrAmountInput
                value={amount}
                onChange={setAmount}
                placeholder="1,00,000"
                disabled={loading || saving || !schedule}
                aria-invalid={fieldError('amount') ? true : undefined}
              />
              <FormFieldError message={fieldError('amount')} />
              {received > 0 ? (
                <p className="text-xs text-ds-gray-500">
                  Min amount: ₹ {Math.round(received)} (already received on this instalment).
                </p>
              ) : null}
            </div>

            {needsAdjust && adjustOptions.length > 0 ? (
              <div className="space-y-1.5">
                <FieldLabel required>
                  {delta > 0 ? 'Take increase from' : 'Return decrease to'}
                </FieldLabel>
                <SearchableSelect
                  value={selectedAdjustLabel}
                  onValueChange={(label) => {
                    const row = adjustOptions.find(
                      (s) => instalmentAdjustLabel(s, delta > 0) === label
                    );
                    setAdjustScheduleId(row?.id ?? '');
                  }}
                  options={adjustScheduleLabels}
                  placeholder="Select an instalment"
                  searchPlaceholder="Search instalment…"
                  disabled={loading || saving}
                  className="w-full"
                />
                <FormFieldError message={fieldError('adjustScheduleId')} />
                <p className="text-xs text-ds-gray-500">
                  {delta > 0
                    ? `₹ ${Math.abs(delta)} will be deducted from the selected instalment.`
                    : `₹ ${Math.abs(delta)} will be added back to the selected instalment.`}
                </p>
              </div>
            ) : null}

            {needsAdjust && adjustOptions.length === 0 ? (
              <p className="text-xs text-ds-error-600">
                No other instalment has pending balance to adjust against. You can still change
                the name or due date if the amount stays the same.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-ds-gray-100 bg-card px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
