'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
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
import { formatInrCompactLacCr } from '../inr-format';
import {
  FinancialsListTable,
  type FinancialBookingRow
} from './financials-list-table';

type LedgerRow = {
  booking_id: string;
  demand_amount: number;
  received_amount: number;
  outstanding_amount: number;
  is_overdue: boolean;
};

type BookingRow = {
  id: string;
  project_id: string;
  unit_id: string;
  customer_id: string;
  created_at: string;
  status: string;
};

type OverdueRow = {
  project_id: string;
  booking_id: string;
  schedule_id: string;
  instalment_no?: number;
  milestone: string;
  due_date: string | null;
  demand_amount: number;
  outstanding_amount: number;
};

function KpiCard({
  label,
  value,
  tone = 'default'
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-ds-success-700'
      : tone === 'warning'
        ? 'text-ds-warning-700'
        : tone === 'destructive'
          ? 'text-ds-error-700'
          : 'text-ds-gray-900';
  return (
    <Card className="min-w-0 flex-1 rounded-xl border-ds-gray-200 p-4 shadow-sm">
      <div className="text-xs font-medium text-ds-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${valueClass}`}>
        {value}
      </div>
    </Card>
  );
}

export default function FinancialsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [exportProjectId, setExportProjectId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<null | 'ledger' | 'receipts'>(null);
  const [loadingOverdue, setLoadingOverdue] = useState(false);

  const [totalDemand, setTotalDemand] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [tableRows, setTableRows] = useState<FinancialBookingRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);

  async function loadOverdue() {
    setLoadingOverdue(true);
    const { data, error: oErr } = await supabase
      .from('v_payment_schedule_outstanding')
      .select(
        'project_id,booking_id,schedule_id,instalment_no,milestone,due_date,demand_amount,outstanding_amount'
      )
      .eq('is_overdue', true)
      .order('due_date', { ascending: true })
      .limit(100);
    if (!oErr && data) {
      setOverdueRows(data as OverdueRow[]);
      setTotalOverdue(
        (data as OverdueRow[]).reduce(
          (s, r) => s + Number(r.outstanding_amount || 0),
          0
        )
      );
    }
    setLoadingOverdue(false);
  }

  async function load() {
    setLoading(true);
    setError('');

    const { data: bData, error: bErr } = await supabase
      .from('bookings')
      .select('id,project_id,unit_id,customer_id,created_at,status')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(500);

    if (bErr) {
      setError(bErr.message);
      setLoading(false);
      return;
    }

    const bookings = (bData ?? []) as BookingRow[];
    const bookingIds = bookings.map((b) => b.id);
    if (!bookingIds.length) {
      setTableRows([]);
      setTotalDemand(0);
      setTotalReceived(0);
      setLoading(false);
      return;
    }

    const unitIds = Array.from(new Set(bookings.map((b) => b.unit_id)));
    const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));

    const [unitsRes, custRes, ledgerRes, collRes] = await Promise.all([
      supabase.from('units').select('id,unit_code').in('id', unitIds),
      supabase.from('customers').select('id,full_name').in('id', custIds),
      supabase
        .from('v_payment_schedule_outstanding')
        .select(
          'booking_id,demand_amount,received_amount,outstanding_amount,is_overdue'
        )
        .in('booking_id', bookingIds),
      supabase
        .from('collections')
        .select('booking_id,received_amount')
        .in('booking_id', bookingIds)
    ]);

    if (unitsRes.error) setError(unitsRes.error.message);
    if (custRes.error) setError(custRes.error.message);
    if (ledgerRes.error) setError(ledgerRes.error.message);
    if (collRes.error) setError(collRes.error.message);

    const unitById = new Map(
      (unitsRes.data ?? []).map((u) => [u.id as string, u.unit_code as string])
    );
    const custById = new Map(
      (custRes.data ?? []).map((c) => [c.id as string, c.full_name as string])
    );

    const ledgerByBooking = new Map<
      string,
      { demand: number; received: number; overdue: number }
    >();
    for (const row of (ledgerRes.data ?? []) as LedgerRow[]) {
      const cur = ledgerByBooking.get(row.booking_id) ?? {
        demand: 0,
        received: 0,
        overdue: 0
      };
      cur.demand += Number(row.demand_amount || 0);
      cur.received += Number(row.received_amount || 0);
      if (row.is_overdue) {
        cur.overdue += Number(row.outstanding_amount || 0);
      }
      ledgerByBooking.set(row.booking_id, cur);
    }

    const collByBooking = new Map<string, number>();
    for (const c of collRes.data ?? []) {
      const id = c.booking_id as string;
      collByBooking.set(
        id,
        (collByBooking.get(id) ?? 0) + Number(c.received_amount || 0)
      );
    }

    let demandSum = 0;
    let receivedSum = 0;

    const rows: FinancialBookingRow[] = bookings.map((b) => {
      const ledger = ledgerByBooking.get(b.id);
      const demand = ledger?.demand ?? 0;
      const receivedAlloc = ledger?.received ?? 0;
      const receivedTotal = collByBooking.get(b.id) ?? receivedAlloc;
      const balance = Math.max(0, demand - receivedTotal);
      demandSum += demand;
      receivedSum += receivedTotal;
      return {
        id: b.id,
        project_id: b.project_id,
        unit_id: b.unit_id,
        customer_id: b.customer_id,
        created_at: b.created_at,
        status: b.status,
        unit_code: unitById.get(b.unit_id) ?? '—',
        customer_name: custById.get(b.customer_id) ?? '—',
        total_demand: demand,
        total_received: receivedTotal,
        balance,
        overdue: ledger?.overdue ?? 0
      };
    });

    setTotalDemand(demandSum);
    setTotalReceived(receivedSum);
    setTableRows(rows);
    setLoading(false);
  }

  async function downloadFinancialsExport(kind: 'ledger' | 'receipts') {
    setExporting(kind);
    setError('');
    try {
      const projectQ =
        exportProjectId !== 'all'
          ? `&projectId=${encodeURIComponent(exportProjectId)}`
          : '';
      const res = await fetch(
        `/api/crm/financials/export?kind=${kind}${projectQ}`,
        { credentials: 'same-origin' }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || res.statusText);
      }
      const cd = res.headers.get('Content-Disposition');
      let name = kind === 'ledger' ? 'ledger.csv' : 'receipts.csv';
      const m = cd?.match(/filename="([^"]+)"/);
      if (m?.[1]) name = m[1];
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    void load();
    void loadOverdue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scrollToOverdue = () => {
      if (window.location.hash !== '#crm-financials-overdue') return;
      document.getElementById('crm-financials-overdue')?.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
      });
    };
    scrollToOverdue();
    window.addEventListener('hashchange', scrollToOverdue);
    return () => window.removeEventListener('hashchange', scrollToOverdue);
  }, [overdueRows.length]);

  const totalBalance = Math.max(0, totalDemand - totalReceived);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-sm font-semibold text-ds-gray-900">
              Collections &amp; accounts
            </h1>
            <p className="mt-1 text-xs text-ds-gray-500">
              Portfolio demand vs receipts. Open a booking to record collections
              against the CLD payment schedule.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total demand" value={formatInrCompactLacCr(totalDemand)} />
          <KpiCard
            label="Total received"
            value={formatInrCompactLacCr(totalReceived)}
            tone="success"
          />
          <KpiCard
            label="Balance"
            value={formatInrCompactLacCr(totalBalance)}
            tone="warning"
          />
          <KpiCard
            label="Overdue"
            value={formatInrCompactLacCr(totalOverdue)}
            tone="destructive"
          />
        </section>

        {error ? (
          <div className="mt-3 rounded-md border border-ds-error-200 bg-ds-error-25 p-3 text-sm text-ds-error-700">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Label>Export scope</Label>
            <Select value={exportProjectId} onValueChange={setExportProjectId}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => void downloadFinancialsExport('ledger')}
          >
            {exporting === 'ledger' ? 'Exporting…' : 'Export ledger CSV'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => void downloadFinancialsExport('receipts')}
          >
            {exporting === 'receipts' ? 'Exporting…' : 'Export receipts CSV'}
          </Button>
        </div>

        <div className="text-sm font-semibold text-ds-gray-900">Bookings</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Select Manage to open payment schedule and collection entry for a booking.
        </p>
        <div className="mt-4">
          <FinancialsListTable
            rows={tableRows}
            projectNameById={projectNameById}
            loading={loading}
          />
        </div>
      </Card>

      <div id="crm-financials-overdue">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-ds-gray-900">
                Overdue demands
              </div>
              <p className="text-xs text-ds-gray-500">
                Past-due instalments with outstanding balance
              </p>
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
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[48rem] w-full text-sm">
              <thead className="bg-ds-gray-50 text-xs text-ds-gray-500">
                <tr>
                  {['Project', 'Unit / booking', '#', 'Milestone', 'Due', 'Outstanding', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-ds-gray-200 px-3 py-2 text-left font-semibold"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {overdueRows.map((r) => {
                  const bookingRow = tableRows.find((b) => b.id === r.booking_id);
                  return (
                    <tr key={r.schedule_id} className="border-b border-ds-gray-100">
                      <td className="max-w-[120px] truncate px-3 py-2 text-xs text-ds-gray-600">
                        {projectNameById.get(r.project_id) ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {bookingRow?.unit_code ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-ds-gray-600">
                        {r.instalment_no != null ? r.instalment_no : '—'}
                      </td>
                      <td className="px-3 py-2">{r.milestone}</td>
                      <td className="px-3 py-2 text-ds-gray-600">
                        {r.due_date ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-semibold text-ds-error-700">
                        {formatInrCompactLacCr(Number(r.outstanding_amount))}
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/crm/financials/${r.booking_id}`}>
                            Manage
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {overdueRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-ds-gray-500"
                    >
                      {loadingOverdue
                        ? 'Loading…'
                        : 'No overdue schedule lines.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
