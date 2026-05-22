'use client';

import Link from 'next/link';
import { pageError } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInr } from '../inr-format';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format-display-date';
import { cn } from '@/lib/utils';
import type { InquiryStageData } from '../inquiry/inquiry-types';
import { isInquiryClosed } from '../inquiry/inquiry-stage-transitions';
import {
  followUpDueState,
  followUpNeedsAttention
} from '@/lib/inquiry/follow-up-due';

type WorkTab = 'followups' | 'visits' | 'overdue';

type FollowRow = {
  followId: string;
  dueAt: string;
  note: string | null;
  inquiryId: string;
  customerName: string;
  funnelStage: string;
  projectName: string;
  stageKey: string;
  assignedTo: string | null;
  assignedToMe: boolean;
  needsAttention: boolean;
};

type VisitRow = {
  visitId: string;
  scheduledAt: string;
  status: string;
  outcome: string | null;
  inquiryId: string;
  customerName: string;
  projectName: string;
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
  project_id: string;
  projectName: string;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function stageDataOf(
  raw: InquiryStageData | Record<string, unknown> | null | undefined
): InquiryStageData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as InquiryStageData;
}

export default function WorkQueuePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );
  const [tab, setTab] = useState<WorkTab>('followups');
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [visitRows, setVisitRows] = useState<VisitRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
        try {
      const { data: inquiryRows, error: iErr } = await supabase
        .from('sales_inquiries')
        .select(
          `
          id,
          funnel_stage,
          assigned_to,
          stage_data,
          projects ( name ),
          customers ( full_name )
        `
        );
      if (iErr) throw iErr;

      const {
        data: { user }
      } = await supabase.auth.getUser();
      const me = user?.id ?? '';

      const follows: FollowRow[] = [];
      const visits: VisitRow[] = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      for (const row of inquiryRows ?? []) {
        const r = row as {
          id: string;
          funnel_stage: string;
          assigned_to: string | null;
          stage_data: InquiryStageData | null;
          projects: unknown;
          customers: unknown;
        };
        const proj = embedOne(
          r.projects as { name: string | null } | { name: string | null }[] | null
        );
        const projectName = proj?.name?.trim() || '—';
        const cust = embedOne(
          r.customers as
            | { full_name: string | null }
            | { full_name: string | null }[]
            | null
        );
        const customerName = cust?.full_name?.trim() || '—';
        const inquiryId = r.id;
        const sd = stageDataOf(r.stage_data);
        const funnelStage = String(r.funnel_stage ?? '');
        if (isInquiryClosed(sd, funnelStage)) continue;

        const followCandidates: { key: string; due: string; note: string | null }[] =
          [];
        const enquiryDue = String(sd.enquiry?.follow_up_date ?? '').trim();
        if (enquiryDue) {
          followCandidates.push({
            key: 'enquiry',
            due: enquiryDue,
            note: String(sd.enquiry?.notes ?? '').trim() || null
          });
        }
        const qualifiedDue = String(sd.qualified?.follow_up_date ?? '').trim();
        if (qualifiedDue) {
          followCandidates.push({
            key: 'qualified',
            due: qualifiedDue,
            note: String(sd.qualified?.notes ?? '').trim() || null
          });
        }
        const siteVisitDue = String(sd.site_visit?.follow_up_date ?? '').trim();
        if (siteVisitDue) {
          followCandidates.push({
            key: 'site_visit',
            due: siteVisitDue,
            note: String(sd.site_visit?.notes ?? '').trim() || null
          });
        }

        const assignedTo = String(r.assigned_to ?? '').trim() || null;
        const assignedToMe = Boolean(me && assignedTo && assignedTo === me);

        for (const fc of followCandidates) {
          const needsAttention = followUpNeedsAttention(fc.due);
          follows.push({
            followId: `${inquiryId}:${fc.key}`,
            dueAt: fc.due,
            note: fc.note,
            inquiryId,
            customerName,
            funnelStage,
            projectName,
            stageKey: fc.key,
            assignedTo,
            assignedToMe,
            needsAttention
          });
        }

        const sv = sd.site_visit ?? {};
        const scheduledAt = String(sv.scheduled_at ?? '').trim();
        const status = String(sv.status ?? 'Scheduled').trim();
        if (scheduledAt && status === 'Scheduled') {
          const at = new Date(scheduledAt);
          if (at.getTime() >= todayStart.getTime()) {
            visits.push({
              visitId: `${inquiryId}:site_visit`,
              scheduledAt,
              status,
              outcome: String(sv.outcome ?? '').trim() || null,
              inquiryId,
              customerName,
              projectName
            });
          }
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
          'booking_id,schedule_id,instalment_no,milestone,due_date,demand_amount,outstanding_amount,customer_id,project_id'
        )
        .eq('is_overdue', true)
        .order('due_date', { ascending: true })
        .limit(200);
      if (ovErr) throw ovErr;
      setOverdueRows(
        (ovd ?? []).map((r) => {
          const row = r as OverdueRow & { project_id: string };
          return {
            ...row,
            projectName: projectNameById.get(row.project_id) ?? '—'
          };
        })
      );
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load work queue');
      setFollowRows([]);
      setVisitRows([]);
      setOverdueRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, projectNameById]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: WorkTab; label: string; count: number }[] = [
    { id: 'followups', label: 'Open follow-ups', count: followRows.length },
    { id: 'visits', label: 'Upcoming site visits', count: visitRows.length },
    { id: 'overdue', label: 'Overdue demands', count: overdueRows.length }
  ];

  return (
    <div className="flex flex-col gap-4">

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
                ? 'border-ds-primary-500 font-semibold text-ds-primary-600'
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
            Follow-up dates from enquiry pipeline (enquiry, qualified &amp; visit
            site). Rows highlighted when assigned to you and due today or overdue.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {['Due', 'Project', 'Customer', 'Stage', 'Assignee', 'Note', ''].map(
                    (h) => (
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
                      colSpan={7}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No open follow-ups.'}
                    </td>
                  </tr>
                ) : (
                  followRows.map((r) => {
                    const dueState = followUpDueState(r.dueAt);
                    const highlight =
                      r.assignedToMe && r.needsAttention;
                    return (
                    <tr
                      key={r.followId}
                      className={cn(
                        'border-b border-slate-100',
                        highlight &&
                          'border-l-4 border-l-ds-primary-500 bg-ds-primary-50/80'
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        <span
                          className={cn(
                            highlight && 'font-semibold text-ds-primary-800',
                            dueState === 'overdue' && 'text-ds-error-700'
                          )}
                        >
                          {formatDisplayDateTime(r.dueAt)}
                        </span>
                        {highlight ? (
                          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ds-primary-700">
                            Your follow-up
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-xs text-slate-600">
                        {r.projectName}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.stageKey === 'site_visit'
                          ? 'Visit site'
                          : r.funnelStage}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.assignedToMe ? (
                          <span className="font-semibold text-ds-primary-700">
                            You
                          </span>
                        ) : r.assignedTo ? (
                          'Assigned'
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="max-w-[280px] px-3 py-2 text-xs text-slate-600">
                        {r.note?.trim() || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href={`/crm/inquiry/new?inquiry=${encodeURIComponent(r.inquiryId)}`}
                          className="text-xs font-semibold text-ds-primary-600 underline"
                        >
                          Open pipeline
                        </Link>
                      </td>
                    </tr>
                    );
                  })
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
                  {['When', 'Project', 'Customer', 'Status', ''].map((h) => (
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
                      colSpan={5}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No upcoming site visits.'}
                    </td>
                  </tr>
                ) : (
                  visitRows.map((r) => (
                    <tr key={r.visitId} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {formatDisplayDateTime(r.scheduledAt)}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-xs text-slate-600">
                        {r.projectName}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {r.customerName}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.status}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href={`/crm/inquiry/new?inquiry=${encodeURIComponent(r.inquiryId)}`}
                          className="text-xs font-semibold text-ds-primary-600 underline"
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
              href="/crm/financials"
              className="text-[11px] font-semibold text-ds-primary-600 underline"
            >
              Open in Financials
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {['Project', 'Booking', '#', 'Milestone', 'Due', 'Outstanding', ''].map(
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
                      colSpan={7}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      {loading ? 'Loading…' : 'No overdue lines.'}
                    </td>
                  </tr>
                ) : (
                  overdueRows.map((r) => (
                    <tr key={r.schedule_id} className="border-b border-slate-100">
                      <td className="max-w-[120px] truncate px-3 py-2 text-xs text-slate-600">
                        {r.projectName}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-600">
                        {r.booking_id}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.instalment_no != null ? r.instalment_no : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.milestone}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {formatDisplayDate(r.due_date)}
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-red-700">
                        ₹{' '}
                        {formatInr(Number(r.outstanding_amount), {
                          maximumFractionDigits: 0
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href="/crm/financials"
                          className="text-xs font-semibold text-ds-primary-600 underline"
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
