'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInrCompactLacCr } from '../inr-format';
import { statusLabelForUnit } from '../inventory/unit-status';
import { CrmKpiGridSkeleton } from '../_components/crm-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

type BookingIdRow = { id: string };
type CollectionSumRow = { received_amount: number };
type ScheduleSumRow = { amount: number };

export default function ReportsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);

  const [unitCounts, setUnitCounts] = useState<Record<string, number>>({});
  const [totalSchedules, setTotalSchedules] = useState(0);
  const [totalCollections, setTotalCollections] = useState(0);

  async function load() {
    setLoading(true);
    
    // Inventory counts
    const { data: unitStatusRows, error: unitErr } = await supabase
      .from('units')
      .select('status')
      .limit(10000);
    if (unitErr) pageError(unitErr.message);
    const counts: Record<string, number> = {};
    (unitStatusRows ?? []).forEach((r) => {
      const s = (r as { status: string }).status;
      counts[s] = (counts[s] || 0) + 1;
    });
    setUnitCounts(counts);

    // Financial totals
    const { data: bookingIds, error: bErr } = await supabase
      .from('bookings')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (bErr) pageError(bErr.message);

    const ids = (bookingIds ?? []) as BookingIdRow[];
    const bookingIdList = ids.map((b) => b.id);

    if (!bookingIdList.length) {
      setTotalSchedules(0);
      setTotalCollections(0);
      setLoading(false);
      return;
    }

    const [{ data: scheduleRows, error: sErr }, { data: collectionRows, error: cErr }] =
      await Promise.all([
        supabase
          .from('payment_schedules')
          .select('amount')
          .in('booking_id', bookingIdList)
          .limit(10000),
        supabase
          .from('collections')
          .select('received_amount')
          .in('booking_id', bookingIdList)
          .limit(10000)
      ]);

    if (sErr) pageError(sErr.message);
    if (cErr) pageError(cErr.message);

    const schedTotal = (scheduleRows ?? []).reduce(
      (sum, r) => sum + Number((r as ScheduleSumRow).amount || 0),
      0
    );
    const collTotal = (collectionRows ?? []).reduce(
      (sum, r) => sum + Number((r as CollectionSumRow).received_amount || 0),
      0
    );

    setTotalSchedules(schedTotal);
    setTotalCollections(collTotal);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalInventory = Object.values(unitCounts).reduce((s, v) => s + v, 0);
  const balance = totalSchedules - totalCollections;

  const initialLoading = loading && totalInventory === 0 && totalSchedules === 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Reports & Analytics (MVP)
          </div>
          <div className="text-xs text-muted-foreground">
            Computed aggregates across all accessible projects.
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Card>

      {initialLoading ? (
        <>
          <CrmKpiGridSkeleton count={4} cols={4} />
          <Card className="p-4">
            <Skeleton className="h-4 w-40" />
            <div className="mt-3 grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </Card>
        </>
      ) : (
        <>
      <div className="grid grid-cols-4 gap-3">
        {[
          ['Total inventory', totalInventory],
          ['Total scheduled', formatInrCompactLacCr(totalSchedules)],
          ['Total collections', formatInrCompactLacCr(totalCollections)],
          ['Balance', formatInrCompactLacCr(balance)]
        ].map(([k, v]) => (
          <Card key={String(k)} className="p-4">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground">
          Inventory by status
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {Object.keys(unitCounts).length === 0 ? (
            <div className="col-span-3 text-xs text-muted-foreground">No units.</div>
          ) : (
            Object.entries(unitCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => (
                <div key={k} className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    {statusLabelForUnit(k)}
                  </div>
                  <div className="text-lg font-semibold text-foreground">{n}</div>
                </div>
              ))
          )}
        </div>
      </Card>
        </>
      )}

      <Card className="p-4 text-sm text-ds-gray-600">
        Next steps: exportable report views, date filters (FY/month), and SQL
        views for faster aggregations.
      </Card>
    </div>
  );
}

