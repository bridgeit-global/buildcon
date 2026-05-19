'use client';

import Link from 'next/link';
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
import { formatInr, formatInrCompactLacCr } from '../../inr-format';
import { PaymentScheduleTable } from '../payment-schedule-table';

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
  const [error, setError] = useState('');
  const [entryScheduleId, setEntryScheduleId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryMode, setEntryMode] = useState('NEFT');
  const [entryRef, setEntryRef] = useState('');
  const [saving, setSaving] = useState(false);

  async function syncScheduleIfNeeded() {
    try {
      await fetch(`/api/crm/bookings/${encodeURIComponent(bookingId)}/sync-schedule`, {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {
      /* non-blocking; schedule may already be correct */
    }
  }

  async function loadFinancials() {
    if (!bookingId) return;
    setLoading(true);
    setError('');

    await syncScheduleIfNeeded();

    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id,project_id,unit_id,customer_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !booking) {
      setError(bErr?.message ?? 'Booking not found');
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
          .select('id,schedule_id,received_amount,received_at,mode,reference')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
      ]);

    setUnitCode((unit?.unit_code as string) ?? '—');
    setCustomerName((customer?.full_name as string) ?? '—');

    if (schedRes.error) setError(schedRes.error.message);
    if (collRes.error) setError(collRes.error.message);
    setSchedules((schedRes.data ?? []) as ScheduleRow[]);
    setCollections((collRes.data ?? []) as CollectionRow[]);
    setEntryScheduleId('');
    setLoading(false);
  }

  useEffect(() => {
    void loadFinancials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const receivedBySchedule = collections.reduce<Record<string, number>>(
    (acc, c) => {
      if (c.schedule_id) {
        acc[c.schedule_id] = (acc[c.schedule_id] || 0) + c.received_amount;
      }
      return acc;
    },
    {}
  );

  const totalAmount = schedules.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = collections.reduce(
    (s, r) => s + (r.received_amount || 0),
    0
  );
  const totalBalance = totalAmount - totalReceived;

  async function addCollection() {
    if (!bookingId || !entryAmount) return;
    setSaving(true);
    setError('');
    try {
      const { error: insErr } = await supabase.from('collections').insert({
        booking_id: bookingId,
        schedule_id: entryScheduleId || null,
        received_amount: Number(entryAmount),
        received_at: entryDate || null,
        mode: entryMode,
        reference: entryRef || null
      });
      if (insErr) throw insErr;
      setEntryAmount('');
      setEntryDate('');
      setEntryRef('');
      await loadFinancials();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save collection');
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

        {error ? (
          <div className="mt-3 rounded-md border border-ds-error-200 bg-ds-error-25 p-3 text-sm text-ds-error-700">
            {error}
          </div>
        ) : null}
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
          />
        </div>
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
              onValueChange={(v) =>
                setEntryScheduleId(v === FIN_SCHEDULE_UNASSIGNED ? '' : v)
              }
              disabled={loading}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIN_SCHEDULE_UNASSIGNED}>
                  (Optional) Unassigned
                </SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.instalment_no}. {s.milestone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input
              value={entryAmount}
              onChange={(e) => setEntryAmount(e.target.value)}
              placeholder="671040"
              disabled={loading}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={entryMode} onValueChange={setEntryMode} disabled={loading}>
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
            <Label>Reference</Label>
            <Input
              value={entryRef}
              onChange={(e) => setEntryRef(e.target.value)}
              placeholder="UTR / Cheque No."
              disabled={loading}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => void addCollection()}
              disabled={saving || loading || !entryAmount}
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
                    {c.mode ?? '—'} · {c.received_at ?? '—'} · {c.reference ?? '—'}
                  </div>
                </div>
                <div className="text-xs text-ds-gray-500">
                  {c.schedule_id ? 'Assigned to instalment' : 'Unassigned'}
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
