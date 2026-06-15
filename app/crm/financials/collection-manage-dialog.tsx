'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InrAmountInput } from '@/components/ui/inr-amount-input';
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
import {
  collectionEntrySchema,
  type CollectionEntryValues
} from '@/lib/financials/collection-entry.schema';
import { zodFieldErrors } from '@/lib/form/zod-field-errors';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import {
  generatedReceiptExistsForCollection,
  persistCollectionReceipt
} from '@/lib/booking/persist-collection-receipt';
import { CollectionsListTable, type CollectionsListRow } from './collections-list-table';
import { formatInr } from '../inr-format';

const FIN_SCHEDULE_UNASSIGNED = '__fin_schedule_unassigned__';

export type ManageScheduleRow = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
  pending?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  loading?: boolean;
  schedules: ManageScheduleRow[];
  pendingSchedules: ManageScheduleRow[];
  collections: CollectionsListRow[];
  scheduleLabelById: Map<string, string>;
  defaultScheduleId?: string | null;
  defaultAmount?: number | null;
  onSaved: () => void | Promise<void>;
};

export function CollectionManageDialog({
  open,
  onOpenChange,
  bookingId,
  loading,
  schedules,
  pendingSchedules,
  collections,
  scheduleLabelById,
  defaultScheduleId,
  defaultAmount,
  onSaved
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [entryScheduleId, setEntryScheduleId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryMode, setEntryMode] = useState('NEFT');
  const [entryRef, setEntryRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [collectionTouched, setCollectionTouched] = useState<
    Partial<Record<keyof CollectionEntryValues, boolean>>
  >({});
  const [collectionSubmitAttempted, setCollectionSubmitAttempted] = useState(false);

  const collectionErrors = useMemo(
    () =>
      zodFieldErrors<keyof CollectionEntryValues>(
        collectionEntrySchema.safeParse({
          entryAmount,
          entryDate,
          entryMode,
          entryRef
        })
      ),
    [entryAmount, entryDate, entryMode, entryRef]
  );

  function collectionFieldError(field: keyof CollectionEntryValues) {
    if (!collectionSubmitAttempted && !collectionTouched[field]) return undefined;
    return collectionErrors[field];
  }

  function touchCollectionField(field: keyof CollectionEntryValues) {
    setCollectionTouched((t) => ({ ...t, [field]: true }));
  }

  function instalmentLabelForSchedule(scheduleId: string | null): string | null {
    if (!scheduleId) return 'Unassigned receipt';
    const row = schedules.find((s) => s.id === scheduleId);
    if (!row) return null;
    return `${row.instalment_no}. ${row.milestone}`;
  }

  function resetForm(scheduleId?: string | null, amount?: number | null) {
    setEntryScheduleId(scheduleId || '');
    const prefill =
      scheduleId && pendingSchedules.find((s) => s.id === scheduleId)?.pending;
    const amountPrefill =
      amount != null && Number.isFinite(amount) && amount > 0 ? amount : null;
    setEntryAmount(
      prefill
        ? String(Math.round(prefill))
        : amountPrefill
          ? String(Math.round(amountPrefill))
          : ''
    );
    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryMode('NEFT');
    setEntryRef('');
    setCollectionTouched({});
    setCollectionSubmitAttempted(false);
  }

  useEffect(() => {
    if (!open) return;
    resetForm(defaultScheduleId ?? null, defaultScheduleId ? null : defaultAmount ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultScheduleId, defaultAmount]);

  async function addCollection() {
    if (!bookingId) return;
    setCollectionSubmitAttempted(true);
    const parsed = collectionEntrySchema.safeParse({
      entryAmount,
      entryDate,
      entryMode,
      entryRef
    });
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('collections')
        .insert({
          booking_id: bookingId,
          schedule_id: entryScheduleId || null,
          received_amount: Number(entryAmount),
          received_at: entryDate || null,
          mode: entryMode,
          reference: entryRef || null
        })
        .select('id')
        .maybeSingle();
      if (insErr) throw insErr;
      const collectionId = inserted?.id as string | undefined;
      if (collectionId) {
        const receiptRes = await persistCollectionReceipt(
          supabase,
          bookingId,
          {
            collectionId,
            receivedAmount: Number(entryAmount),
            receivedAt: entryDate || null,
            mode: entryMode,
            reference: entryRef || null,
            instalmentLabel: instalmentLabelForSchedule(entryScheduleId || null)
          },
          { notify: false }
        );
        if (receiptRes.ok) {
          toast.success(
            'Collection saved. Payment receipt stored in Documents — review and Send to notify the customer.'
          );
        } else {
          toast.warning(`Collection saved; receipt PDF failed: ${receiptRes.error}`);
        }
      }
      resetForm(entryScheduleId || null);
      await onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save collection');
    } finally {
      setSaving(false);
    }
  }

  async function generateReceiptForCollection(c: CollectionsListRow) {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('generated_documents')
        .select('storage_path')
        .eq('booking_id', bookingId)
        .limit(200);
      if (
        generatedReceiptExistsForCollection(
          (existing ?? []) as { storage_path: string }[],
          c.id
        )
      ) {
        toast.info('Receipt for this collection is already in Documents.');
        return;
      }
      const receiptRes = await persistCollectionReceipt(
        supabase,
        bookingId,
        {
          collectionId: c.id,
          receivedAmount: c.received_amount,
          receivedAt: c.received_at,
          mode: c.mode,
          reference: c.reference,
          instalmentLabel: instalmentLabelForSchedule(c.schedule_id)
        },
        { notify: false }
      );
      if (!receiptRes.ok) throw new Error(receiptRes.error);
      toast.success(
        'Payment receipt saved. Review in Documents, then Send to notify the customer.'
      );
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Receipt failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCollection(c: CollectionsListRow) {
    const ok = window.confirm(
      `Delete this collection entry of ₹ ${formatInr(Number(c.received_amount || 0), {
        maximumFractionDigits: 0
      })}? This cannot be undone.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('collections').delete().eq('id', c.id);
      if (error) throw error;
      toast.success('Collection entry deleted.');
      await onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,760px)] w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden border-ds-gray-200 p-0 sm:max-w-4xl">
        <div className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-ds-gray-100 bg-linear-to-br from-ds-primary-50/80 to-white px-4 py-4 sm:px-6">
            <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
              Manage collections
            </DialogTitle>
            <DialogDescription className="text-left text-xs text-ds-gray-600">
              Add a payment collection entry and manage saved receipts against milestones.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="text-xs font-semibold text-ds-gray-500">Add collection</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-12">
                <Label>Instalment</Label>
                <Select
                  value={entryScheduleId === '' ? FIN_SCHEDULE_UNASSIGNED : entryScheduleId}
                  onValueChange={(v) => {
                    if (v === FIN_SCHEDULE_UNASSIGNED) {
                      setEntryScheduleId('');
                      const amountPrefill =
                        defaultAmount != null &&
                        Number.isFinite(defaultAmount) &&
                        defaultAmount > 0
                          ? defaultAmount
                          : null;
                      setEntryAmount(
                        amountPrefill ? String(Math.round(amountPrefill)) : ''
                      );
                      return;
                    }
                    setEntryScheduleId(v);
                    const row = pendingSchedules.find((s) => s.id === v);
                    if (row?.pending) {
                      setEntryAmount(String(Math.round(row.pending)));
                    }
                  }}
                  disabled={loading || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FIN_SCHEDULE_UNASSIGNED}>
                      (Optional) Unassigned
                    </SelectItem>
                    {pendingSchedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.instalment_no}. {s.milestone} · ₹{' '}
                        {formatInr(Number(s.pending || 0), { maximumFractionDigits: 0 })} due
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 lg:col-span-4">
                <Label>Amount (₹)</Label>
                <InrAmountInput
                  value={entryAmount}
                  onChange={(v) => {
                    setEntryAmount(v);
                    touchCollectionField('entryAmount');
                  }}
                  onBlur={() => touchCollectionField('entryAmount')}
                  aria-invalid={collectionFieldError('entryAmount') ? true : undefined}
                  placeholder="1,00,000"
                  disabled={loading || saving}
                />
                <FormFieldError message={collectionFieldError('entryAmount')} />
              </div>

              <TextInputField
                label="Date"
                type="date"
                inputClassName="min-w-42 pr-10"
                value={entryDate}
                onChange={(e) => {
                  setEntryDate(e.target.value);
                  touchCollectionField('entryDate');
                }}
                onBlur={() => touchCollectionField('entryDate')}
                error={collectionFieldError('entryDate')}
                disabled={loading || saving}
              />

              <div className="space-y-1.5 lg:col-span-4">
                <Label>Mode</Label>
                <Select
                  value={entryMode}
                  onValueChange={(v) => {
                    setEntryMode(v);
                    touchCollectionField('entryMode');
                  }}
                  disabled={loading || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormFieldError message={collectionFieldError('entryMode')} />
              </div>

              <TextInputField
                className="sm:col-span-2 lg:col-span-9"
                label="Reference"
                required={entryMode !== 'Cash'}
                value={entryRef}
                onChange={(e) => {
                  setEntryRef(e.target.value);
                  touchCollectionField('entryRef');
                }}
                onBlur={() => touchCollectionField('entryRef')}
                error={collectionFieldError('entryRef')}
                placeholder="UTR / Cheque No."
                disabled={loading || saving}
              />

              <div className="flex items-end sm:col-span-2 lg:col-span-12 lg:justify-end">
                <Button
                  className="w-full whitespace-nowrap sm:w-auto lg:ml-auto"
                  onClick={() => void addCollection()}
                  disabled={saving || loading}
                >
                  {saving ? 'Saving…' : 'Save collection'}
                </Button>
              </div>
            </div>


          </div>

          <DialogFooter className="shrink-0 border-t border-ds-gray-100 bg-white px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

