'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr, formatInrCompactLacCr } from '../../inr-format';
import { PaymentScheduleTable } from '../payment-schedule-table';
import {
  BookingLedgerTable,
  buildBookingLedgerRows
} from '../booking-ledger-table';
import {
  generatedReceiptExistsForCollection,
  persistCollectionReceipt
} from '@/lib/booking/persist-collection-receipt';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import {
  collectionEntrySchema,
  type CollectionEntryValues
} from '@/lib/financials/collection-entry.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { zodFieldErrors } from '@/lib/form/zod-field-errors';

const FIN_SCHEDULE_UNASSIGNED = '__fin_schedule_unassigned__';

type ScheduleRow = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

type CollectionRow = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
  created_at: string | null;
};

export default function FinancialsBookingPage() {
  const params = useParams();
  const bookingId = String(params.bookingId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [unitCode, setUnitCode] = useState('—');
  const [customerName, setCustomerName] = useState('—');
  const [projectId, setProjectId] = useState('');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryScheduleId, setEntryScheduleId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [entryMode, setEntryMode] = useState('NEFT');
  const [entryRef, setEntryRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingDemandFor, setGeneratingDemandFor] = useState<string | null>(null);
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



  async function loadFinancials() {
    if (!bookingId) return;
    setLoading(true);
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id,project_id,unit_id,customer_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !booking) {
      pageError(bErr?.message ?? 'Booking not found');
      setLoading(false);
      return;
    }

    setProjectId(booking.project_id as string);

    const [{ data: unit }, { data: customer }, schedRes, collRes] =
      await Promise.all([
        supabase
          .from('units')
          .select('unit_code')
          .eq('id', booking.unit_id)
          .maybeSingle(),
        supabase
          .from('customers')
          .select('full_name')
          .eq('id', booking.customer_id)
          .maybeSingle(),
        supabase
          .from('payment_schedules')
          .select('id,instalment_no,milestone,due_date,amount')
          .eq('booking_id', bookingId)
          .order('instalment_no', { ascending: true }),
        supabase
          .from('collections')
          .select('id,schedule_id,received_amount,received_at,mode,reference,created_at')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
      ]);

    setUnitCode((unit?.unit_code as string) ?? '—');
    setCustomerName((customer?.full_name as string) ?? '—');

    if (schedRes.error) pageError(schedRes.error.message);
    if (collRes.error) pageError(collRes.error.message);
    setSchedules((schedRes.data ?? []) as ScheduleRow[]);
    setCollections((collRes.data ?? []) as CollectionRow[]);
    setEntryScheduleId('');
    setLoading(false);
  }

  useEffect(() => {
    void loadFinancials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const receivedBySchedule = useMemo(
    () =>
      collections.reduce<Record<string, number>>((acc, c) => {
        if (c.schedule_id) {
          acc[c.schedule_id] = (acc[c.schedule_id] || 0) + c.received_amount;
        }
        return acc;
      }, {}),
    [collections]
  );

  const pendingSchedules = useMemo(
    () =>
      schedules
        .map((s) => {
          const received = receivedBySchedule[s.id] || 0;
          const pending = Math.max(0, (s.amount || 0) - received);
          return { ...s, pending };
        })
        .filter((s) => s.pending > 0),
    [schedules, receivedBySchedule]
  );

  const totalAmount = schedules.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = collections.reduce(
    (s, r) => s + (r.received_amount || 0),
    0
  );
  const totalBalance = totalAmount - totalReceived;

  const scheduleLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of schedules) {
      m.set(s.id, `${s.instalment_no}. ${s.milestone}`);
    }
    return m;
  }, [schedules]);

  const ledgerRows = useMemo(
    () => buildBookingLedgerRows(schedules, collections, scheduleLabelById),
    [schedules, collections, scheduleLabelById]
  );

  function instalmentLabelForSchedule(scheduleId: string | null): string | null {
    if (!scheduleId) return 'Unassigned receipt';
    const row = schedules.find((s) => s.id === scheduleId);
    if (!row) return null;
    return `${row.instalment_no}. ${row.milestone}`;
  }

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
        const receiptRes = await persistCollectionReceipt(supabase, bookingId, {
          collectionId,
          receivedAmount: Number(entryAmount),
          receivedAt: entryDate || null,
          mode: entryMode,
          reference: entryRef || null,
          instalmentLabel: instalmentLabelForSchedule(entryScheduleId || null)
        }, { notify: false });
        if (receiptRes.ok) {
          toast.success(
            'Collection saved. Payment receipt stored in Documents — review and Send to notify the customer.'
          );
        } else {
          toast.warning(`Collection saved; receipt PDF failed: ${receiptRes.error}`);
        }
      }
      setEntryAmount('');
      setEntryDate(new Date().toISOString().slice(0, 10));
      setEntryRef('');
      setCollectionTouched({});
      setCollectionSubmitAttempted(false);
      await loadFinancials();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save collection');
    } finally {
      setSaving(false);
    }
  }

  async function generateDemandForSchedule(schedule: ScheduleRow) {
    if (!bookingId) return;
    setGeneratingDemandFor(schedule.id);
    try {
      const received = receivedBySchedule[schedule.id] || 0;
      const pending = Math.max(0, (schedule.amount || 0) - received);
      const persisted = await requestGenerateBookingDocument(bookingId, {
        kind: 'demand-letter',
        linkId: schedule.id,
        htmlOverrides: {
          instalmentLabel: `${schedule.instalment_no}. ${schedule.milestone}`,
          demandAmount: pending > 0 ? pending : schedule.amount,
          demandDueDate: schedule.due_date
        },
        notify: false
      });
      if (!persisted.ok) throw new Error(persisted.error);
      toast.success(
        `Demand letter for instalment ${schedule.instalment_no} saved. Review in Documents, then Send to notify the customer.`
      );
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Demand letter failed');
    } finally {
      setGeneratingDemandFor(null);
    }
  }

  async function generateReceiptForCollection(c: CollectionRow) {
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
      const receiptRes = await persistCollectionReceipt(supabase, bookingId, {
        collectionId: c.id,
        receivedAmount: c.received_amount,
        receivedAt: c.received_at,
        mode: c.mode,
        reference: c.reference,
        instalmentLabel: instalmentLabelForSchedule(c.schedule_id)
      }, { notify: false });
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1" asChild>
          <Link href="/crm/financials">
            <ArrowLeft className="h-4 w-4" />
            All financials
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/crm/bookings/${bookingId}`}>Open booking</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/crm/documents/${encodeURIComponent(bookingId)}`}>
            Unit documents
          </Link>
        </Button>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">
          {projectNameById.get(projectId) ?? 'Project'} · {unitCode}
        </div>
        <p className="mt-0.5 text-sm text-ds-gray-600">{customerName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Final unit price', totalAmount, 'text-ds-gray-900'],
            ['Total received', totalReceived, 'text-ds-success-700'],
            ['Balance', totalBalance, 'text-ds-error-700'],
            [
              'Unassigned receipts',
              collections
                .filter((c) => !c.schedule_id)
                .reduce((s, c) => s + c.received_amount, 0),
              'text-ds-gray-700'
            ]
          ].map(([label, val, tone]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/50 p-3"
            >
              <div className="text-xs text-ds-gray-500">{label}</div>
              <div className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>
                {formatInrCompactLacCr(Number(val))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">Account ledger</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Debit rows are instalment demands; credit rows are collections. Balance is demand minus
          receipts (updates when you save a collection or when token is posted at confirmation).
        </p>
        <div className="mt-3">
          <BookingLedgerTable rows={ledgerRows} loading={loading} />
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">Payment schedule</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Seeded at booking confirmation; instalment due dates update when the matching
          CLD stage is logged complete on the project.
        </p>
        <div className="mt-3">
          <PaymentScheduleTable
            rows={schedules}
            receivedBySchedule={receivedBySchedule}
            loading={loading}
            onlyUnpaid
          />
        </div>
        {schedules.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-ds-gray-500">Demand letters</div>
            <p className="text-xs text-ds-gray-500">
              Generate one demand letter per instalment; each is stored under Documents for this
              unit.
            </p>
            <div className="flex flex-wrap gap-2">
              {schedules.map((s) => {
                const received = receivedBySchedule[s.id] || 0;
                const pending = Math.max(0, (s.amount || 0) - received);
                const busy = generatingDemandFor === s.id;
                return (
                  <Button
                    key={s.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || loading || pending <= 0}
                    onClick={() => void generateDemandForSchedule(s)}
                    title={
                      pending <= 0
                        ? 'No pending amount on this instalment'
                        : `Demand for ₹ ${formatInr(pending, { maximumFractionDigits: 0 })}`
                    }
                  >
                    {busy ? 'Saving…' : `Demand — ${s.instalment_no}. ${s.milestone}`}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">Collection entry</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="sm:col-span-2">
            <Label>Instalment</Label>
            <Select
              value={
                entryScheduleId === ''
                  ? FIN_SCHEDULE_UNASSIGNED
                  : entryScheduleId
              }
              onValueChange={(v) => {
                if (v === FIN_SCHEDULE_UNASSIGNED) {
                  setEntryScheduleId('');
                  return;
                }
                setEntryScheduleId(v);
                const row = pendingSchedules.find((s) => s.id === v);
                if (row) {
                  setEntryAmount(String(Math.round(row.pending)));
                }
              }}
              disabled={loading}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIN_SCHEDULE_UNASSIGNED}>
                  (Optional) Unassigned
                </SelectItem>
                {pendingSchedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.instalment_no}. {s.milestone} · ₹{' '}
                    {formatInr(s.pending, { maximumFractionDigits: 0 })} due
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input
              value={entryAmount}
              onChange={(e) => {
                setEntryAmount(e.target.value);
                touchCollectionField('entryAmount');
              }}
              onBlur={() => touchCollectionField('entryAmount')}
              aria-invalid={collectionFieldError('entryAmount') ? true : undefined}
              placeholder={
                pendingSchedules[0]
                  ? String(Math.round(pendingSchedules[0].pending))
                  : 'Amount'
              }
              disabled={loading}
            />
            <FormFieldError message={collectionFieldError('entryAmount')} />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => {
                setEntryDate(e.target.value);
                touchCollectionField('entryDate');
              }}
              onBlur={() => touchCollectionField('entryDate')}
              aria-invalid={collectionFieldError('entryDate') ? true : undefined}
              disabled={loading}
            />
            <FormFieldError message={collectionFieldError('entryDate')} />
          </div>
          <div>
            <Label>Mode</Label>
            <Select
              value={entryMode}
              onValueChange={(v) => {
                setEntryMode(v);
                touchCollectionField('entryMode');
              }}
              disabled={loading}
            >
              <SelectTrigger className="mt-1 w-full">
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
          </div>
          <div className="sm:col-span-2">
            <Label>
              Reference
              {entryMode !== 'Cash' && (
                <span className="text-ds-error-500"> *</span>
              )}
            </Label>
            <Input
              value={entryRef}
              onChange={(e) => {
                setEntryRef(e.target.value);
                touchCollectionField('entryRef');
              }}
              onBlur={() => touchCollectionField('entryRef')}
              aria-invalid={collectionFieldError('entryRef') ? true : undefined}
              placeholder="UTR / Cheque No."
              disabled={loading}
            />
            <FormFieldError message={collectionFieldError('entryRef')} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => void addCollection()}
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Save collection'}
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-ds-gray-500">Saved entries</div>
          <div className="mt-2 flex flex-col gap-2">
            {collections.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ds-gray-200 bg-white p-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-ds-gray-900">
                    ₹{' '}
                    {formatInr(Number(c.received_amount), {
                      maximumFractionDigits: 0
                    })}
                  </div>
                  <div className="text-xs text-ds-gray-500">
                    {c.mode ?? '—'} · {formatDisplayDate(c.received_at)} · {c.reference ?? '—'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ds-gray-500">
                    {c.schedule_id ? 'Assigned to instalment' : 'Unassigned'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || loading}
                    onClick={() => void generateReceiptForCollection(c)}
                  >
                    Save receipt to Documents
                  </Button>
                </div>
              </div>
            ))}
            {!loading && collections.length === 0 ? (
              <div className="py-6 text-sm text-ds-gray-500">No collections yet.</div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
