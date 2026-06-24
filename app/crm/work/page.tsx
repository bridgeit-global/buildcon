'use client';

import Link from 'next/link';
import { pageError } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InquiryStageData } from '../inquiry/inquiry-types';
import { isInquiryClosed } from '../inquiry/inquiry-stage-transitions';
import { followUpNeedsAttention } from '@/lib/inquiry/follow-up-due';
import {
  WorkFollowupsTable,
  type WorkFollowRow
} from './work-followups-table';
import { WorkVisitsTable, type WorkVisitRow } from './work-visits-table';
import {
  WorkOverdueTable,
  type WorkOverdueRow
} from './work-overdue-table';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import { resolveSortFromState, sortRowsByState } from '@/lib/crm/list-sort';

type WorkTab = 'followups' | 'visits' | 'overdue';

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
  const [followRows, setFollowRows] = useState<WorkFollowRow[]>([]);
  const [visitRows, setVisitRows] = useState<WorkVisitRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<WorkOverdueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { sorting: followSorting, onSortingChange: onFollowSortingChange } =
    useServerListSorting([{ id: 'dueAt', desc: false }]);
  const { sorting: visitSorting, onSortingChange: onVisitSortingChange } =
    useServerListSorting([{ id: 'scheduledAt', desc: false }]);
  const { sorting: overdueSorting, onSortingChange: onOverdueSortingChange } =
    useServerListSorting([{ id: 'due_date', desc: false }]);

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

      const follows: WorkFollowRow[] = [];
      const visits: WorkVisitRow[] = [];
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
      setFollowRows(
        sortRowsByState(follows, followSorting, (row, colId) => {
          if (colId === 'dueAt') return row.dueAt;
          if (colId === 'projectName') return row.projectName;
          if (colId === 'customerName') return row.customerName;
          if (colId === 'stage') return row.funnelStage;
          if (colId === 'assignee') return row.assignedToMe ? 'you' : row.assignedTo ?? '';
          if (colId === 'note') return row.note ?? '';
          return null;
        })
      );
      setVisitRows(
        sortRowsByState(visits, visitSorting, (row, colId) => {
          if (colId === 'scheduledAt') return row.scheduledAt;
          if (colId === 'projectName') return row.projectName;
          if (colId === 'customerName') return row.customerName;
          if (colId === 'status') return row.status;
          return null;
        })
      );

      const OVERDUE_DB_SORT: Record<string, string> = {
        due_date: 'due_date',
        instalment_no: 'instalment_no',
        outstanding_amount: 'outstanding_amount',
        booking_id: 'booking_id'
      };
      const { column, ascending } = resolveSortFromState(
        overdueSorting,
        OVERDUE_DB_SORT,
        'due_date',
        true
      );
      const { data: ovd, error: ovErr } = await supabase
        .from('v_payment_schedule_outstanding')
        .select(
          'booking_id,schedule_id,instalment_no,milestone,due_date,demand_amount,outstanding_amount,customer_id,project_id'
        )
        .eq('is_overdue', true)
        .order(column, { ascending })
        .limit(200);
      if (ovErr) throw ovErr;
      let overdue = (ovd ?? []).map((r) => {
        const row = r as WorkOverdueRow & { project_id: string };
        return {
          ...row,
          projectName: projectNameById.get(row.project_id) ?? '—'
        };
      });
      const overdueFirst = overdueSorting[0];
      if (overdueFirst && (overdueFirst.id === 'projectName' || overdueFirst.id === 'milestone')) {
        overdue = sortRowsByState(overdue, overdueSorting, (row, colId) => {
          if (colId === 'projectName') return row.projectName;
          if (colId === 'milestone') return row.milestone;
          return null;
        });
      }
      setOverdueRows(overdue);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load work queue');
      setFollowRows([]);
      setVisitRows([]);
      setOverdueRows([]);
    } finally {
      setLoading(false);
    }
  }, [followSorting, overdueSorting, projectNameById, supabase, visitSorting]);

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
          <div className="border-b border-ds-gray-100 bg-ds-gray-50/80 px-4 py-2 text-[11px] font-semibold text-ds-gray-700">
            Follow-up dates from enquiry pipeline (enquiry, qualified &amp; visit
            site). Rows highlighted when assigned to you and due today or overdue.
          </div>
          <div className="p-4">
            <WorkFollowupsTable
              rows={followRows}
              loading={loading}
              sorting={followSorting}
              onSortingChange={onFollowSortingChange}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'visits' ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-ds-gray-100 bg-ds-gray-50/80 px-4 py-2 text-[11px] font-semibold text-ds-gray-700">
            Scheduled site visits from today onward
          </div>
          <div className="p-4">
            <WorkVisitsTable
              rows={visitRows}
              loading={loading}
              sorting={visitSorting}
              onSortingChange={onVisitSortingChange}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'overdue' ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-gray-100 bg-ds-gray-50/80 px-4 py-2">
            <div className="text-[11px] font-semibold text-ds-gray-700">
              Overdue schedule lines
            </div>
            <Link
              href="/crm/financials"
              className="text-[11px] font-semibold text-ds-primary-600 underline"
            >
              Open in Financials
            </Link>
          </div>
          <div className="p-4">
            <WorkOverdueTable
              rows={overdueRows}
              loading={loading}
              sorting={overdueSorting}
              onSortingChange={onOverdueSortingChange}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
