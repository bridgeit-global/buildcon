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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { formatInr } from '../inr-format';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  nextInstalmentNo: number;
  pendingAmount: number;
  breakableSchedules: {
    id: string;
    instalment_no: number;
    milestone: string;
    balance: number;
  }[];
  loading?: boolean;
  onSaved: () => void | Promise<void>;
};

export function CreateMilestoneDialog({
  open,
  onOpenChange,
  bookingId,
  nextInstalmentNo,
  pendingAmount,
  breakableSchedules,
  loading,
  onSaved
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [breakFromScheduleId, setBreakFromScheduleId] = useState('');
  const [milestone, setMilestone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBreakFromScheduleId(breakableSchedules[0]?.id ?? '');
    setMilestone('');
    setDueDate('');
    setAmount('');
    setSaving(false);
    setSubmitAttempted(false);
  }, [open, breakableSchedules]);

  const milestoneTrim = milestone.trim();
  const amountNum = Number(amount);
  const pending = Number.isFinite(pendingAmount) ? Math.max(0, pendingAmount) : 0;
  const breakFrom = breakableSchedules.find((s) => s.id === breakFromScheduleId) ?? null;
  const breakFromBalance = Math.max(0, breakFrom?.balance ?? 0);
  const amountExceedsPending = Number.isFinite(amountNum) && amountNum > pending;
  const amountExceedsBreakFrom = Number.isFinite(amountNum) && amountNum > breakFromBalance;

  function fieldError(field: 'breakFrom' | 'milestone' | 'amount') {
    if (!submitAttempted) return undefined;
    if (field === 'breakFrom' && !breakFromScheduleId) {
      return 'Select an instalment to split.';
    }
    if (field === 'milestone' && !milestoneTrim) {
      return 'Milestone name is required.';
    }
    if (field === 'amount') {
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return 'Enter a valid amount.';
      }
      if (amountExceedsPending) {
        return `Amount cannot exceed pending balance (₹ ${Math.round(pending)}).`;
      }
      if (amountExceedsBreakFrom) {
        return `Amount cannot exceed selected instalment pending (₹ ${Math.round(
          breakFromBalance
        )}).`;
      }
    }
    return undefined;
  }

  const canSave =
    !loading &&
    !saving &&
    Boolean(bookingId) &&
    Boolean(breakFromScheduleId) &&
    milestoneTrim.length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    pending > 0 &&
    !amountExceedsPending &&
    !amountExceedsBreakFrom;

  async function save() {
    setSubmitAttempted(true);
    if (!canSave) {
      pageError(
        amountExceedsPending
          ? `Amount cannot exceed pending balance (₹ ${Math.round(pending)}).`
          : amountExceedsBreakFrom
            ? `Amount cannot exceed selected instalment pending (₹ ${Math.round(
              breakFromBalance
            )}).`
            : 'Enter a milestone name and a valid amount.'
      );
      return;
    }
    setSaving(true);
    try {
      // Split: reduce selected instalment amount, then insert a new milestone row.
      const reduceBy = Math.round(amountNum);
      const { data: oldRow, error: oldErr } = await supabase
        .from('payment_schedules')
        .select('id, amount')
        .eq('id', breakFromScheduleId)
        .maybeSingle();
      if (oldErr) throw oldErr;
      if (!oldRow) throw new Error('Selected instalment not found.');
      const oldAmount = Number(oldRow.amount || 0);
      const newAmount = oldAmount - reduceBy;
      if (!(Number.isFinite(newAmount) && newAmount >= 0)) {
        throw new Error('Split would make instalment amount negative.');
      }

      const { error: updErr } = await supabase
        .from('payment_schedules')
        .update({ amount: newAmount })
        .eq('id', breakFromScheduleId);
      if (updErr) throw updErr;

      const { error: insErr } = await supabase.from('payment_schedules').insert({
        booking_id: bookingId,
        instalment_no: nextInstalmentNo,
        milestone: milestoneTrim,
        due_date: dueDate || null,
        amount: reduceBy
      });
      if (insErr) throw insErr;

      toast.success('Milestone added to payment schedule.');
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create milestone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg border-ds-gray-200 p-0">
        <DialogHeader className="border-b border-ds-gray-100 bg-linear-to-br from-ds-primary-50/80 to-white px-4 py-4 sm:px-6">
          <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
            Create milestone
          </DialogTitle>
          <DialogDescription className="text-left text-xs text-ds-gray-600">
            Add a new instalment row to this booking’s payment schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <FieldLabel required>Break from</FieldLabel>
              <Select
                value={breakFromScheduleId}
                onValueChange={(v) => setBreakFromScheduleId(v)}
                disabled={loading || saving || breakableSchedules.length === 0}
              >
                <SelectTrigger
                  className="w-full"
                  aria-invalid={fieldError('breakFrom') ? true : undefined}
                >
                  <SelectValue placeholder="Select an instalment to split" />
                </SelectTrigger>
                <SelectContent>
                  {breakableSchedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.instalment_no}. {s.milestone} · ₹{' '}
                      {formatInr(Math.round(Math.max(0, s.balance)), {
                        maximumFractionDigits: 0
                      })}{' '}
                      pending
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormFieldError message={fieldError('breakFrom')} />
              <p className="text-xs text-ds-gray-500">
                The entered amount will be deducted from the selected instalment’s pending.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Instalment no.</Label>
              <Input value={String(nextInstalmentNo)} disabled />
            </div>

            <TextInputField
              label="Milestone"
              required
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              error={fieldError('milestone')}
              placeholder="e.g. Plinth complete"
              disabled={loading || saving}
            />

            <TextInputField
              label="Due date"
              type="date"
              inputClassName="min-w-42 pr-10"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={loading || saving}
            />
            <p className="text-xs text-ds-gray-500">
              Optional. CLD stage completion may update due dates later.
            </p>

            <div className="space-y-1.5">
              <FieldLabel required>Amount (₹)</FieldLabel>
              <InrAmountInput
                value={amount}
                onChange={setAmount}
                placeholder="1,00,000"
                disabled={loading || saving}
                aria-invalid={fieldError('amount') ? true : undefined}
              />
              <FormFieldError message={fieldError('amount')} />
              {pending > 0 ? (
                <p className="text-xs text-ds-gray-500">
                  Max allowed: ₹ {Math.round(Math.min(pending, breakFromBalance || pending))}{' '}
                  (pending)
                </p>
              ) : (
                <p className="text-xs text-ds-gray-500">
                  Pending balance is ₹ 0. You can’t create a new payable milestone right now.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-ds-gray-100 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Create milestone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

