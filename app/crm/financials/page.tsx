'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
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
import { formatInr } from '../inr-format';

const FIN_SCHEDULE_UNASSIGNED = '__fin_schedule_unassigned__';
const FIN_BOOKING_NONE = '__fin_booking_none__';

type BookingRow = {
  id: string;
  unit_id: string;
  customer_id: string;
  created_at: string;
};

type UnitRow = { id: string; unit_code: string };
type CustomerRow = { id: string; full_name: string };

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

type OverdueRow = {
  booking_id: string;
  schedule_id: string;
  milestone: string;
  due_date: string | null;
  demand_amount: number;
  outstanding_amount: number;
  customer_id: string;
};

export default function FinancialsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [unitsById, setUnitsById] = useState<Record<string, UnitRow>>({});
  const [customersById, setCustomersById] = useState<Record<string, CustomerRow>>(
    {}
  );
  const [bookingId, setBookingId] = useState<string>('');

  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [entryScheduleId, setEntryScheduleId] = useState<string>('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryMode, setEntryMode] = useState('NEFT');
  const [entryRef, setEntryRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [loadingOverdue, setLoadingOverdue] = useState(false);

  async function loadOverdue() {
    if (!activeProjectId) {
      setOverdueRows([]);
      return;
    }
    setLoadingOverdue(true);
    const { data, error: oErr } = await supabase
      .from('v_payment_schedule_outstanding')
      .select(
        'booking_id,schedule_id,milestone,due_date,demand_amount,outstanding_amount,customer_id'
      )
      .eq('project_id', activeProjectId)
      .eq('is_overdue', true)
      .order('due_date', { ascending: true })
      .limit(200);
    if (!oErr && data) setOverdueRows(data as OverdueRow[]);
    setLoadingOverdue(false);
  }

  async function loadBookings() {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');

    const { data: bData, error: bErr } = await supabase
      .from('bookings')
      .select('id,unit_id,customer_id,created_at')
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (bErr) setError(bErr.message);
    const bRows = (bData ?? []) as BookingRow[];
    setBookings(bRows);
    setBookingId((prev) => prev || bRows[0]?.id || '');

    const unitIds = Array.from(new Set(bRows.map((b) => b.unit_id)));
    const custIds = Array.from(new Set(bRows.map((b) => b.customer_id)));

    if (unitIds.length) {
      const { data, error } = await supabase
        .from('units')
        .select('id,unit_code')
        .in('id', unitIds);
      if (error) setError(error.message);
      const map: Record<string, UnitRow> = {};
      (data ?? []).forEach((u) => (map[(u as UnitRow).id] = u as UnitRow));
      setUnitsById(map);
    } else {
      setUnitsById({});
    }

    if (custIds.length) {
      const { data, error } = await supabase
        .from('customers')
        .select('id,full_name')
        .in('id', custIds);
      if (error) setError(error.message);
      const map: Record<string, CustomerRow> = {};
      (data ?? []).forEach((c) => (map[(c as CustomerRow).id] = c as CustomerRow));
      setCustomersById(map);
    } else {
      setCustomersById({});
    }

    setLoading(false);
  }

  async function loadFinancials() {
    if (!bookingId) {
      setSchedules([]);
      setCollections([]);
      return;
    }
    setLoading(true);
    setError('');
    const [{ data: sData, error: sErr }, { data: cData, error: cErr }] =
      await Promise.all([
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

    if (sErr) setError(sErr.message);
    if (cErr) setError(cErr.message);
    setSchedules((sData ?? []) as ScheduleRow[]);
    setCollections((cData ?? []) as CollectionRow[]);
    setEntryScheduleId('');
    setLoading(false);
  }

  useEffect(() => {
    void loadBookings();
    void loadOverdue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  useEffect(() => {
    void loadFinancials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const receivedBySchedule = collections.reduce<Record<string, number>>(
    (acc, c) => {
      if (c.schedule_id) acc[c.schedule_id] = (acc[c.schedule_id] || 0) + c.received_amount;
      return acc;
    },
    {}
  );

  const totalAmount = schedules.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = collections.reduce((s, r) => s + (r.received_amount || 0), 0);
  const totalBalance = totalAmount - totalReceived;

  async function addCollection() {
    if (!bookingId || !entryAmount) return;
    setSaving(true);
    setError('');
    try {
      const { error } = await supabase.from('collections').insert({
        booking_id: bookingId,
        schedule_id: entryScheduleId || null,
        received_amount: Number(entryAmount),
        received_at: entryDate || null,
        mode: entryMode,
        reference: entryRef || null
      });
      if (error) throw error;
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

  const booking = bookings.find((b) => b.id === bookingId) ?? null;
  const unitCode = booking ? unitsById[booking.unit_id]?.unit_code : null;
  const customerName = booking
    ? customersById[booking.customer_id]?.full_name
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[360px]">
            <Label>Booking</Label>
            <Select
              value={bookingId === '' ? FIN_BOOKING_NONE : bookingId}
              onValueChange={(v) =>
                setBookingId(v === FIN_BOOKING_NONE ? '' : v)
              }
              disabled={loading}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIN_BOOKING_NONE}>Select booking…</SelectItem>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {unitsById[b.unit_id]?.unit_code ?? '—'} ·{' '}
                    {customersById[b.customer_id]?.full_name ?? '—'} ·{' '}
                    {new Date(b.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />
          <Button variant="outline" onClick={loadBookings} disabled={loading}>
            Refresh
          </Button>
        </div>

        {booking ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Customer</div>
              <div className="text-sm font-semibold text-gray-900">
                {customerName ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Unit</div>
              <div className="text-sm font-semibold text-gray-900">
                {unitCode ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Balance</div>
              <div className="text-sm font-semibold text-gray-900">
                ₹ {formatInr(totalBalance, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-900">
          Payment schedule
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {[
                  '#',
                  'Milestone',
                  'Due date',
                  'Amount',
                  'Received',
                  'Balance',
                  'Status'
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const rec = receivedBySchedule[s.id] || 0;
                const bal = (s.amount || 0) - rec;
                const status = bal <= 0 ? 'Paid' : rec > 0 ? 'Partially Paid' : 'Pending';
                return (
                  <tr key={s.id} className="border-b">
                    <td className="px-4 py-3 text-gray-600">{s.instalment_no}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {s.milestone}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      ₹ {formatInr(Number(s.amount || 0), { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-green-700 font-semibold">
                      ₹ {formatInr(rec, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-red-700 font-semibold">
                      ₹ {formatInr(bal, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border px-2 py-1 text-xs">
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No schedule rows yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-3 font-semibold text-gray-900">
                  Total
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  ₹ {formatInr(totalAmount, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 font-semibold text-green-700">
                  ₹ {formatInr(totalReceived, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 font-semibold text-red-700">
                  ₹ {formatInr(totalBalance, { maximumFractionDigits: 0 })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-900">
          Collection entry
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3 items-end">
          <div className="col-span-2">
            <Label>Instalment</Label>
            <Select
              value={
                entryScheduleId === ''
                  ? FIN_SCHEDULE_UNASSIGNED
                  : entryScheduleId
              }
              onValueChange={(v) =>
                setEntryScheduleId(
                  v === FIN_SCHEDULE_UNASSIGNED ? '' : v
                )
              }
              disabled={!bookingId}
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
              disabled={!bookingId}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              disabled={!bookingId}
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select
              value={entryMode}
              onValueChange={setEntryMode}
              disabled={!bookingId}
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
          <div className="col-span-2">
            <Label>Reference</Label>
            <Input
              value={entryRef}
              onChange={(e) => setEntryRef(e.target.value)}
              placeholder="UTR / Cheque No."
              disabled={!bookingId}
            />
          </div>
          <div className="col-span-1" />
          <Button onClick={addCollection} disabled={saving || !bookingId || !entryAmount}>
            {saving ? 'Saving…' : 'Save collection'}
          </Button>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500">Saved entries</div>
          <div className="mt-2 flex flex-col gap-2">
            {collections.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border bg-white p-3 text-sm flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-gray-900">
                    ₹{' '}
                    {formatInr(Number(c.received_amount), {
                      maximumFractionDigits: 0
                    })}
                  </div>
                  <div className="text-xs text-gray-500">
                    {c.mode ?? '—'} · {c.received_at ?? '—'} · {c.reference ?? '—'}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {c.schedule_id ? 'Assigned' : 'Unassigned'}
                </div>
              </div>
            ))}
            {collections.length === 0 ? (
              <div className="py-6 text-sm text-gray-500">No collections yet.</div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">
            Overdue demands (ledger view)
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadOverdue()}
            disabled={loadingOverdue}
          >
            Refresh
          </Button>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['Booking', 'Milestone', 'Due', 'Demand', 'Outstanding'].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold border-b">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {overdueRows.map((r) => (
                <tr key={r.schedule_id} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs">{r.booking_id}</td>
                  <td className="px-3 py-2">{r.milestone}</td>
                  <td className="px-3 py-2 text-gray-600">{r.due_date ?? '—'}</td>
                  <td className="px-3 py-2">
                    ₹{' '}
                    {formatInr(Number(r.demand_amount), {
                      maximumFractionDigits: 0
                    })}
                  </td>
                  <td className="px-3 py-2 text-red-700 font-semibold">
                    ₹{' '}
                    {formatInr(Number(r.outstanding_amount), {
                      maximumFractionDigits: 0
                    })}
                  </td>
                </tr>
              ))}
              {overdueRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {loadingOverdue
                      ? 'Loading…'
                      : activeProjectId
                        ? 'No overdue schedule lines for this project.'
                        : 'Select a project.'}
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

