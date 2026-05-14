'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { FUNNEL_STAGES } from '../inquiry/inquiry-pipeline-dialog';
import { UNIT_STATUS_CODES, STATUS_LABEL } from '../inventory/inventory-utils';

type FunnelCounts = Record<string, number>;

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [funnel, setFunnel] = useState<FunnelCounts>({});
  const [inventoryMix, setInventoryMix] = useState<Record<string, number>>({});
  const [collections30d, setCollections30d] = useState<number>(0);
  const [overdueLines, setOverdueLines] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeProjectId) {
      setFunnel({});
      setInventoryMix({});
      setCollections30d(0);
      setOverdueLines(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString().slice(0, 10);

      const { data: bookingRows, error: bErr } = await supabase
        .from('bookings')
        .select('id')
        .eq('project_id', activeProjectId);
      if (bErr) throw bErr;
      const bookingIds = (bookingRows ?? []).map((r: { id: string }) => r.id);

      let collSum = 0;
      if (bookingIds.length) {
        const { data: collRows, error: cErr } = await supabase
          .from('collections')
          .select('received_amount, received_at')
          .in('booking_id', bookingIds)
          .gte('received_at', sinceIso);
        if (cErr) throw cErr;
        (collRows ?? []).forEach((r: { received_amount: number | null }) => {
          collSum += Number(r.received_amount) || 0;
        });
      }

      const [oppRes, unitsRes, ovdRes] = await Promise.all([
        supabase
          .from('sales_opportunities')
          .select('funnel_stage')
          .eq('project_id', activeProjectId),
        supabase.from('units').select('status').eq('project_id', activeProjectId),
        supabase
          .from('v_payment_schedule_outstanding')
          .select('schedule_id', { count: 'exact', head: true })
          .eq('project_id', activeProjectId)
          .eq('is_overdue', true)
      ]);

      if (oppRes.error) throw oppRes.error;
      if (unitsRes.error) throw unitsRes.error;
      if (ovdRes.error) throw ovdRes.error;

      const fc: FunnelCounts = {};
      for (const s of FUNNEL_STAGES) fc[s] = 0;
      (oppRes.data ?? []).forEach((r: { funnel_stage: string }) => {
        const k = r.funnel_stage;
        if (fc[k] !== undefined) fc[k]++;
        else fc[k] = 1;
      });
      setFunnel(fc);

      const mix: Record<string, number> = {};
      for (const k of UNIT_STATUS_CODES) mix[k] = 0;
      (unitsRes.data ?? []).forEach((r: { status: string }) => {
        if (mix[r.status] !== undefined) mix[r.status]++;
      });
      setInventoryMix(mix);

      setCollections30d(collSum);
      setOverdueLines(ovdRes.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelTotal = useMemo(
    () => Object.values(funnel).reduce((a, b) => a + b, 0),
    [funnel]
  );

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to see the dashboard.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-900/80">
          Next actions
        </div>
        <p className="mt-1 text-[11px] text-blue-900/60">
          Jump to daily follow-up, inventory matrix, finance, or leads.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/crm/work"
            className="inline-flex rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
          >
            Work queue
          </Link>
          <Link
            href="/crm/inquiry"
            className="inline-flex rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
          >
            Leads & pipeline
          </Link>
          <Link
            href="/crm/inventory"
            className="inline-flex rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
          >
            Inventory grid
          </Link>
          <Link
            href="/crm/financials#crm-financials-overdue"
            className="inline-flex rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
          >
            Overdue demands
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline (opportunities)
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {loading ? '…' : funnelTotal}
          </div>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
            {FUNNEL_STAGES.map((s) => (
              <div key={s} className="flex justify-between gap-2">
                <span>{s}</span>
                <span className="font-semibold text-foreground">
                  {funnel[s] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inventory mix
          </div>
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto text-[11px]">
            {UNIT_STATUS_CODES.map((k) => {
              const n = inventoryMix[k] ?? 0;
              if (n === 0) return null;
              return (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {STATUS_LABEL[k] ?? k}
                  </span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Collections (30d)
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {loading
              ? '…'
              : `₹ ${collections30d.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Overdue schedule lines:{' '}
            <span className="font-semibold text-foreground">{overdueLines}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
