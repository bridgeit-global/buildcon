'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  const [exporting, setExporting] = useState<null | 'ledger' | 'receipts'>(null);

  const [totalDemand, setTotalDemand] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [tableRows, setTableRows] = useState<FinancialBookingRow[]>([]);

  async function load() {
    setLoading(true);

    const { data: bData, error: bErr } = await supabase
      .from('bookings')
      .select('id,project_id,unit_id,customer_id,created_at,status')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(500);

    if (bErr) {
      pageError(bErr.message);
      setLoading(false);
      return;
    }

    const bookingsRaw = (bData ?? []) as BookingRow[];
    // One row per unit: keep newest booking when duplicates exist (ordered by created_at desc).
    const seenUnitIds = new Set<string>();
    const bookings = bookingsRaw.filter((b) => {
      if (seenUnitIds.has(b.unit_id)) return false;
      seenUnitIds.add(b.unit_id);
      return true;
    });
    const bookingIds = bookings.map((b) => b.id);
    if (!bookingIds.length) {
      setTableRows([]);
      setTotalDemand(0);
      setTotalReceived(0);
      setTotalOverdue(0);
      setLoading(false);
      return;
    }

    const unitIds = Array.from(new Set(bookings.map((b) => b.unit_id)));
    const custIds = Array.from(new Set(bookings.map((b) => b.customer_id)));

    const [unitsRes, custRes, ledgerRes, collRes] = await Promise.all([
      supabase.from('units').select('id,unit_code,status').in('id', unitIds),
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

    if (unitsRes.error) pageError(unitsRes.error.message);
    if (custRes.error) pageError(custRes.error.message);
    if (ledgerRes.error) pageError(ledgerRes.error.message);
    if (collRes.error) pageError(collRes.error.message);

    const unitById = new Map(
      (unitsRes.data ?? []).map((u) => [
        u.id as string,
        {
          unit_code: u.unit_code as string,
          status: (u.status as string | null) ?? null
        }
      ])
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
        unit_code: unitById.get(b.unit_id)?.unit_code ?? '—',
        unit_status: unitById.get(b.unit_id)?.status ?? null,
        customer_name: custById.get(b.customer_id) ?? '—',
        total_demand: demand,
        total_received: receivedTotal,
        balance,
        overdue: ledger?.overdue ?? 0
      };
    });

    setTotalDemand(demandSum);
    setTotalReceived(receivedSum);
    setTotalOverdue(rows.reduce((s, r) => s + r.overdue, 0));
    setTableRows(rows);
    setLoading(false);
  }

  async function downloadFinancialsExport(kind: 'ledger' | 'receipts') {
    setExporting(kind);
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
      pageError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <KpiCard
            label="Portfolio final price"
            value={formatInrCompactLacCr(totalDemand)}
          />
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
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Label>Export scope</Label>
            <SearchableSelect
              value={
                exportProjectId === 'all'
                  ? 'All projects'
                  : (projectNameById.get(exportProjectId) ?? '')
              }
              onValueChange={(name) => {
                if (name === 'All projects') {
                  setExportProjectId('all');
                  return;
                }
                const project = projects.find((p) => p.name === name);
                if (project) setExportProjectId(project.id);
              }}
              options={['All projects', ...projects.map((p) => p.name)]}
              placeholder="All projects"
              searchPlaceholder="Search project…"
              className="mt-1 w-full"
            />
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

    </div>
  );
}
