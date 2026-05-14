'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInr } from '../inr-format';
import { cn } from '@/lib/utils';

type WorkTab = 'followups' | 'visits' | 'overdue';

type FollowRow = {
  followId: string;
  dueAt: string;
  note: string | null;
  inquiryId: string;
  customerName: string;
  funnelStage: string;
};

type VisitRow = {
  visitId: string;
  scheduledAt: string;
  status: string;
  outcome: string | null;
  inquiryId: string;
  customerName: string;
};

type OverdueRow = {
  booking_id: string;
  schedule_id: string;
  instalment_no: number | null;
  milestone: string;
  due_date: string | null;
  demand_amount: number;
  outstanding_amount: number;
  customer_id: string;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function embedList<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export default function WorkQueuePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();
  const [tab, setTab] = useState<WorkTab>('followups');
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [visitRows, setVisitRows] = useState<VisitRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeProjectId) {
      setFollowRows([]);
      setVisitRows([]);
      setOverdueRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: oppRows, error: oErr } = await supabase
        .from('sales_opportunities')
        .select(
          `
          id,
          funnel_stage,
          sales_inquiry_id,
          sales_inquiries (
            id,
            customers ( full_name )
          ),
          sales_follow_ups ( id, due_at, note, completed_at ),
          sales_site_visits ( id, scheduled_at, status, outcome )
        `
        )
        .eq('project_id', activeProjectId);
      if (oErr) throw oErr;

      const follows: FollowRow[] = [];
      const visits: VisitRow[] = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      for (const row of oppRows ?? []) {
        const r = row as {
          funnel_stage: string;
          sales_inquiry_id: string;
          sales_inquiries: unknown;
          sales_follow_ups: unknown;
          sales_site_visits: unknown;
        };
        const inq = embedOne(
          r.sales_inquiries as
            | {
                id: string;
                customers:
                  | { full_name: string | null }
                  | { full_name: string | null }[]
                  | null;
              }
            | null
        );
        const custNode = inq?.customers;
        const cust = embedOne(
          Array.isArray(custNode) ? custNode[0] : custNode
        ) as { full_name: string | null } | null;
        const customerName = cust?.full_name?.trim() || '—';
        const inquiryId = (inq?.id ?? r.sales_inquiry_id) as string;
        const funnelStage = String(r.funnel_stage ?? '');

        for (const fu of embedList(r.sales_follow_ups)) {
          const fr = fu as {
            id: string;
            due_at: string;
            note: string | null;
            completed_at: string | null;
          };
          if (fr.completed_at) continue;
          follows.push({
            followId: fr.id,
            dueAt: fr.due_at,
            note: fr.note,
            inquiryId,
            customerName,
            funnelStage
          });
        }

        for (const sv of embedList(r.sales_site_visits)) {
          const v = sv as {
            id: string;
            scheduled_at: string;
            status: string;
            outcome: string | null;
          };
          if (v.status !== 'Scheduled') continue;
          const at = new Date(v.scheduled_at);
          if (at.getTime() < todayStart.getTime()) continue;
          visits.push({
            visitId: v.id,
            scheduledAt: v.scheduled_at,
            status: v.status,
            outcome: v.outcome,
            inquiryId,
            customerName
          });
        }
      }

      follows.sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      );
      visits.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
      setFollowRows(follows);
      setVisitRows(visits);

      const { data: ovd, error: ovErr } = await supabase
        .from('v_payment_schedule_outstanding')
        .select(
          'booking_id,schedule_id,instalment_no,milestone,due_date,demand_amount,outstanding_amount,customer_id'
        )
        .eq('project_id', activeProjectId)
        .eq('is_overdue', true)
        .order('due_date', { ascending: true })
        .limit(200);
      if (ovErr) throw ovErr;
      setOverdueRows((ovd ?? []) as OverdueRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load work queue');
      setFollowRows([]);
      setVisitRows([]);
      setOverdueRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: WorkTab; label: string; count: number }[] = [
    { id: 'followups', label: 'Open follow-ups', count: followRows.length },
    { id: 'visits', label: 'Upcoming site visits', count: visitRows.length },
    { id: 'overdue', label: 'Overdue demands', count: overdueRows.length }
  ];

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to open the work queue.
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

      <div
        className={cn(
          'flex flex-wrap gap-0 rounded-lg border border-slate-200 bg-white px-1 shadow-sm'
        )}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[11px]',
              tab === t.id
                ? 'border-blue-500 font-semibold text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
            <span className="ml-1 tabular-nums text-slate-400">({t.count})</span>
          </button>
        ))}
        <div className="ml-auto flex items-center pr-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {tab === 'followups' ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-700">
            Incomplete follow-ups (newest due first)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {['Due', 'Customer', 'Stage', 'Note', ''].map((h) => (
                    <th key={h} className="border-b px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {followRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No open follow-ups.'}
                    </td>
                  </tr>
                ) : (
                  followRows.map((r) => (
                    <tr key={r.followId} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {new Date(r.dueAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.funnelStage}
                      </td>
                      <td className="max-w-[280px] px-3 py-2 text-xs text-slate-600">
                        {r.note?.trim() || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href={`/crm/inquiry/pipeline/${encodeURIComponent(r.inquiryId)}`}
                          className="text-xs font-semibold text-blue-700 underline"
                        >
                          Open pipeline
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'visits' ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-700">
            Scheduled site visits from today onward
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {['When', 'Customer', 'Status', ''].map((h) => (
                    <th key={h} className="border-b px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visitRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No upcoming site visits.'}
                    </td>
                  </tr>
                ) : (
                  visitRows.map((r) => (
                    <tr key={r.visitId} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {new Date(r.scheduledAt).toLocaleString('en-IN', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.status}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href={`/crm/inquiry/pipeline/${encodeURIComponent(r.inquiryId)}`}
                          className="text-xs font-semibold text-blue-700 underline"
                        >
                          Open pipeline
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'overdue' ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <div className="text-[11px] font-semibold text-slate-700">
              Overdue schedule lines
            </div>
            <Link
              href="/crm/financials#crm-financials-overdue"
              className="text-[11px] font-semibold text-blue-700 underline"
            >
              Open in Financials
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {['Booking', '#', 'Milestone', 'Due', 'Outstanding', ''].map(
                    (h) => (
                      <th key={h} className="border-b px-3 py-2">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {overdueRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No overdue lines for this project.'}
                    </td>
                  </tr>
                ) : (
                  overdueRows.map((r) => (
                    <tr key={r.schedule_id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-600">
                        {r.booking_id}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.instalment_no != null ? r.instalment_no : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.milestone}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.due_date ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-red-700">
                        ₹{' '}
                        {formatInr(Number(r.outstanding_amount), {
                          maximumFractionDigits: 0
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href="/crm/financials#crm-financials-overdue"
                          className="text-xs font-semibold text-blue-700 underline"
                        >
                          Record receipt
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
