'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatInrCompactLacCr } from '../inr-format';
import { formatFloorLabel } from '../inventory/inventory-utils';
import {
  ChartPanel,
  DashboardWorkflowCta,
  FinCard,
  STAT_CARD_ICONS,
  StatCard
} from './dashboard-widgets';
import {
  InventoryDonutChart,
  MonthlyCollectionsBarChart,
  SalesVsCollectionsLineChart
} from './dashboard-charts';
import {
  countInventoryBuckets,
  countUnitStatusBreakdown,
  inrToCrLabel,
  monthKeyFromIsoDate,
  recentMonthKeys,
  salesVsCollectionsSeries,
  seriesFromMonthMap,
  type InventoryBuckets,
  type MonthPoint,
  type SalesVsCollPoint,
  type UnitStatusSlice
} from './dashboard-utils';

type RecentBooking = {
  id: string;
  booking_amount: number | null;
  units:
    | { unit_code: string; wing_name: string; floor: number; unit_type: string | null }
    | { unit_code: string; wing_name: string; floor: number; unit_type: string | null }[]
    | null;
  customers:
    | { full_name: string }
    | { full_name: string }[]
    | null;
};

function unwrapJoin<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function unitDisplayLine(
  u: { unit_code: string; wing_name: string; floor: number; unit_type: string | null } | null
) {
  if (!u) return '—';
  const floor = formatFloorLabel(u.floor, u.unit_type);
  return `${u.unit_code} · ${u.wing_name} · ${floor}`;
}

function ChartLoading() {
  return (
    <div className="flex h-[220px] items-center justify-center text-xs text-ds-gray-400">
      Loading…
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [buckets, setBuckets] = useState<InventoryBuckets>({
    available: 0,
    booked: 0,
    sold: 0,
    blocked: 0
  });
  const [statusBreakdown, setStatusBreakdown] = useState<UnitStatusSlice[]>([]);
  const [totalInventory, setTotalInventory] = useState(0);
  const [totalSalesInr, setTotalSalesInr] = useState(0);
  const [totalCollectionsInr, setTotalCollectionsInr] = useState(0);
  const [overdueInr, setOverdueInr] = useState(0);
  const [monthlyCollections, setMonthlyCollections] = useState<MonthPoint[]>([]);
  const [salesVsCollections, setSalesVsCollections] = useState<SalesVsCollPoint[]>([]);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const monthKeys = recentMonthKeys(12);

      const [unitsRes, bookingsRes, recentRes, overdueRes] = await Promise.all([
        supabase.from('units').select('status'),
        supabase.from('bookings').select('id'),
        supabase
          .from('bookings')
          .select(
            `
            id,
            booking_amount,
            units ( unit_code, wing_name, floor, unit_type ),
            customers ( full_name )
          `
          )
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('v_payment_schedule_outstanding')
          .select('outstanding_amount')
          .eq('is_overdue', true)
      ]);

      if (unitsRes.error) throw unitsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (recentRes.error) throw recentRes.error;
      if (overdueRes.error) throw overdueRes.error;

      const statuses = (unitsRes.data ?? []).map((r: { status: string }) => r.status);
      const inv = countInventoryBuckets(statuses);
      setBuckets(inv);
      setStatusBreakdown(countUnitStatusBreakdown(statuses));
      setTotalInventory(statuses.length);

      const overdueSum = (overdueRes.data ?? []).reduce(
        (s, r: { outstanding_amount: number }) => s + (Number(r.outstanding_amount) || 0),
        0
      );
      setOverdueInr(overdueSum);

      setRecentBookings((recentRes.data ?? []) as RecentBooking[]);

      const bookingIds = (bookingsRes.data ?? []).map((r: { id: string }) => r.id);

      if (!bookingIds.length) {
        setTotalSalesInr(0);
        setTotalCollectionsInr(0);
        setMonthlyCollections(seriesFromMonthMap(monthKeys, {}));
        setSalesVsCollections(salesVsCollectionsSeries(monthKeys, {}, {}));
        return;
      }

      const [schedRes, collRes] = await Promise.all([
        supabase
          .from('payment_schedules')
          .select('amount,due_date')
          .in('booking_id', bookingIds),
        supabase
          .from('collections')
          .select('received_amount,received_at')
          .in('booking_id', bookingIds)
      ]);

      if (schedRes.error) throw schedRes.error;
      if (collRes.error) throw collRes.error;

      let salesTotal = 0;
      const salesByMonth: Record<string, number> = {};
      for (const row of schedRes.data ?? []) {
        const amt = Number((row as { amount: number }).amount) || 0;
        salesTotal += amt;
        const key = monthKeyFromIsoDate((row as { due_date: string | null }).due_date);
        if (key) salesByMonth[key] = (salesByMonth[key] ?? 0) + amt;
      }

      let collTotal = 0;
      const collByMonth: Record<string, number> = {};
      for (const row of collRes.data ?? []) {
        const amt = Number((row as { received_amount: number }).received_amount) || 0;
        collTotal += amt;
        const key = monthKeyFromIsoDate((row as { received_at: string | null }).received_at);
        if (key) collByMonth[key] = (collByMonth[key] ?? 0) + amt;
      }

      setTotalSalesInr(salesTotal);
      setTotalCollectionsInr(collTotal);
      setMonthlyCollections(seriesFromMonthMap(monthKeys, collByMonth));
      setSalesVsCollections(salesVsCollectionsSeries(monthKeys, salesByMonth, collByMonth));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalReceivablesInr = Math.max(0, totalSalesInr - totalCollectionsInr);
  const collectionsPct =
    totalSalesInr > 0
      ? ((totalCollectionsInr / totalSalesInr) * 100).toFixed(2)
      : '0';

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-xl border border-ds-error-200 bg-ds-error-50 p-3 text-sm text-ds-error-700">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Inventory"
          value={loading ? '…' : totalInventory}
          unit="Units"
          sub="All accessible units"
          accent="primary"
          variant="filled"
          icon={STAT_CARD_ICONS.inventory}
          href="/crm/inventory"
        />
        <StatCard
          label="Booked Units"
          value={loading ? '…' : buckets.booked}
          unit="Units"
          sub="Pipeline"
          accent="warning"
          icon={STAT_CARD_ICONS.booked}
          href="/crm/bookings"
        />
        <StatCard
          label="Sold Units"
          value={loading ? '…' : buckets.sold}
          unit="Units"
          sub="Registered & beyond"
          accent="success"
          icon={STAT_CARD_ICONS.sold}
          href="/crm/inventory"
        />
        <StatCard
          label="Available Units"
          value={loading ? '…' : buckets.available}
          unit="Units"
          sub="Open inventory"
          accent="accent"
          icon={STAT_CARD_ICONS.available}
          href="/crm/inventory"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FinCard
          label="Total Sales Value"
          valueCr={loading ? '—' : inrToCrLabel(totalSalesInr)}
          sub="Scheduled demand"
          tone="primary"
          href="/crm/reports"
        />
        <FinCard
          label="Total Collections"
          valueCr={loading ? '—' : inrToCrLabel(totalCollectionsInr)}
          sub={`${collectionsPct}% of sales`}
          tone="success"
        />
        <FinCard
          label="Total Receivables"
          valueCr={loading ? '—' : inrToCrLabel(totalReceivablesInr)}
          sub="Open finance"
          tone="warning"
          href="/crm/financials"
        />
        <FinCard
          label="Overdue Amount"
          valueCr={loading ? '—' : inrToCrLabel(overdueInr)}
          sub="Past due"
          tone="destructive"
          href="/crm/financials"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ChartPanel title="Sales vs Collections">
            {loading ? (
              <ChartLoading />
            ) : (
              <SalesVsCollectionsLineChart points={salesVsCollections} />
            )}
          </ChartPanel>

          <ChartPanel title="Monthly Collections (₹)">
            {loading ? (
              <ChartLoading />
            ) : (
              <MonthlyCollectionsBarChart points={monthlyCollections} />
            )}
          </ChartPanel>

          {recentBookings.length > 0 ? (
            <Card className="overflow-hidden rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ds-gray-800">Recent bookings</h2>
                <Link
                  href="/crm/bookings"
                  className="min-h-9 shrink-0 text-[11px] font-semibold text-ds-primary-600 hover:text-ds-primary-700 hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-left text-ds-gray-400">
                      <th className="px-2 py-1.5 font-semibold">ID</th>
                      <th className="px-2 py-1.5 font-semibold">Unit</th>
                      <th className="px-2 py-1.5 font-semibold">Customer</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b) => {
                      const u = unwrapJoin(b.units);
                      const c = unwrapJoin(b.customers);
                      const amt = Number(b.booking_amount) || 0;
                      return (
                        <tr key={b.id} className="border-t border-ds-gray-100">
                          <td className="px-2 py-2 font-semibold text-ds-primary-700">
                            {b.id}
                          </td>
                          <td className="px-2 py-2 text-ds-gray-500">{unitDisplayLine(u)}</td>
                          <td className="px-2 py-2 text-ds-gray-800">
                            {c?.full_name ?? '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-ds-success-600">
                            {formatInrCompactLacCr(amt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <ChartPanel title="Inventory Status">
            {loading ? (
              <ChartLoading />
            ) : (
              <InventoryDonutChart breakdown={statusBreakdown} />
            )}
          </ChartPanel>
          <DashboardWorkflowCta />
        </aside>
      </div>
    </div>
  );
}
