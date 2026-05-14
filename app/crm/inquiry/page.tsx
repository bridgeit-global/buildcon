'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { writeBookingPrefill } from '../booking-prefill-storage';
import { embedOne, inquiryReference } from './inquiry-helpers';
import { InquiryListCard } from './inquiry-list-card';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';

const LEAD_SOURCE_COLOR: Record<string, string> = {
  Website: '#2563eb',
  'Social Media': '#ea580c',
  'Walk-in': '#38bdf8',
  Direct: '#64748b',
  Broker: '#9333ea',
  Referral: '#a855f7'
};

function leadSourceColor(label: string, index: number) {
  const trimmed = String(label || '').trim();
  if (LEAD_SOURCE_COLOR[trimmed]) return LEAD_SOURCE_COLOR[trimmed];
  const l = trimmed.toLowerCase();
  if (l.includes('whatsapp')) return '#16a34a';
  if (l.includes('facebook') || l.includes('instagram')) return '#ea580c';
  if (l.includes('website')) return '#2563eb';
  const palette = ['#7c3aed', '#0d9488', '#db2777', '#ca8a04', '#4f46e5'];
  return palette[index % palette.length];
}

function funnelStageBadgeClass(stage: string) {
  const s = String(stage || '').trim();
  if (!s || s === 'Enquiry') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (s === 'Qualified') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (s === 'Site Visit') {
    return 'border-green-200 bg-green-50 text-green-900';
  }
  if (s === 'Lost') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (s === 'Won' || s === 'Booking') {
    return 'border-violet-200 bg-violet-50 text-violet-900';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function funnelStageLabel(stage: string) {
  const s = String(stage || '').trim();
  return s || 'New';
}

function InquiryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [error, setError] = useState('');
  const [units, setUnits] = useState<UnitLabelRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);

  const loadInquiries = useCallback(async () => {
    if (!activeProjectId) return;
    setLoadingInquiries(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(
        `
        id,
        created_at,
        lead_source,
        broker_id,
        brokers ( full_name ),
        interested_in,
        parking_required,
        parking_count,
        parking_slots_available,
        parking_rate_snapshot,
        notes,
        customer_id,
        unit_id,
        customers ( full_name, phone, email ),
        units ( unit_code, wing_name ),
        profiles ( name ),
        sales_opportunities (
          id,
          funnel_stage,
          assigned_to,
          stage_data,
          sales_follow_ups ( id, due_at, note, completed_at ),
          sales_site_visits ( id, scheduled_at, status, outcome )
        )
      `
      )
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      setError(qErr.message);
      setInquiries([]);
    } else {
      setInquiries((data ?? []) as unknown as InquiryRowDb[]);
    }
    setLoadingInquiries(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    const q = searchParams.get('pipelineInquiry')?.trim();
    if (!q || !activeProjectId || loadingInquiries) return;
    const exists = inquiries.some((i) => i.id === q);
    if (exists) {
      router.replace(`/crm/inquiry/pipeline/${encodeURIComponent(q)}`, {
        scroll: false
      });
    }
  }, [
    searchParams,
    activeProjectId,
    inquiries,
    loadingInquiries,
    router
  ]);

  useEffect(() => {
    if (!activeProjectId) {
      setUnits([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: uErr } = await supabase
        .from('units')
        .select('id, unit_code, wing_name')
        .eq('project_id', activeProjectId)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(500);
      if (!cancelled && !uErr) {
        setUnits((data ?? []) as UnitLabelRow[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, supabase]);

  const kpiStats = useMemo(() => {
    const total = inquiries.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const createdToday = inquiries.filter(
      (i) => String(i?.created_at || '').slice(0, 10) === todayStr
    ).length;
    let newLeads = 0;
    let qualified = 0;
    let converted = 0;
    for (const inq of inquiries) {
      const opp = embedOne(inq.sales_opportunities);
      const s = String(opp?.funnel_stage || '').trim();
      if (!opp || s === 'Enquiry') newLeads++;
      else if (s === 'Qualified') qualified++;
      else if (s === 'Won' || s === 'Booking') converted++;
    }
    return { total, createdToday, newLeads, qualified, converted };
  }, [inquiries]);

  const leadSourceSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inq of inquiries) {
      const src = String(inq.lead_source || 'Unknown').trim() || 'Unknown';
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return entries.map(([label, count], i) => ({
      label,
      count,
      color: leadSourceColor(label, i),
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    }));
  }, [inquiries]);

  const recentInquiriesPreview = useMemo(
    () => inquiries.slice(0, 6),
    [inquiries]
  );

  const navigateToBookingFromInquiry = useCallback(
    (inq: InquiryRowDb) => {
      if (!activeProjectId || !String(inq.unit_id || '').trim()) return;
      writeBookingPrefill({
        projectId: activeProjectId,
        inquiryId: inq.id,
        inquiryRef: inquiryReference(inq.id),
        customerId: inq.customer_id,
        unitId: inq.unit_id,
        parkingRequired: inq.parking_required === 'Yes' ? 'Yes' : 'No',
        parkingCount: inq.parking_count,
        parkingSlotsAvailable: inq.parking_slots_available,
        parkingRateSnapshot: inq.parking_rate_snapshot
      });
      router.push('/crm/bookings');
    },
    [activeProjectId, router]
  );

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to manage inquiries.
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Enquiries
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Capture leads, run pipeline, and convert to booking.
          </p>
        </div>
        <Button className="gap-1 bg-blue-600 hover:bg-blue-700" asChild>
          <Link href="/crm/inquiry/new">+ Add enquiry</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              {
                title: 'Total enquiries',
                value: kpiStats.total,
                hint: `${kpiStats.createdToday} today`,
                href: '/crm/inquiry/list'
              },
              {
                title: 'New',
                value: kpiStats.newLeads,
                hint: 'Stage: Enquiry'
              },
              {
                title: 'Qualified',
                value: kpiStats.qualified,
                hint: 'In funnel'
              },
              {
                title: 'Converted',
                value: kpiStats.converted,
                hint: 'Booking or Won'
              }
            ] as const
          ).map((tile) => {
            const body = (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {tile.title}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {loadingInquiries ? '…' : tile.value}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {tile.hint}
                </div>
              </>
            );
            const shellClass =
              'rounded-lg border border-border bg-muted/30 px-3 py-3';
            if ('href' in tile && tile.href) {
              return (
                <Link
                  key={tile.title}
                  href={tile.href}
                  aria-label="View full inquiry list"
                  className={`${shellClass} block transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                >
                  {body}
                </Link>
              );
            }
            return (
              <div key={tile.title} className={shellClass}>
                {body}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground">
            Enquiry source
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lead source for loaded enquiries (up to 500).
          </p>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <LeadSourceDonut slices={leadSourceSlices} />
            <ul className="w-full max-w-sm flex-1 space-y-2 text-sm">
              {leadSourceSlices.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  {loadingInquiries
                    ? 'Loading…'
                    : 'No enquiries yet for this project.'}
                </li>
              ) : (
                leadSourceSlices.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-foreground">
                        {s.label}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {s.pct}% · {s.count}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground">
            Recent enquiries
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Latest by created date.
          </p>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {recentInquiriesPreview.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {loadingInquiries
                  ? 'Loading…'
                  : 'No enquiries yet for this project.'}
              </li>
            ) : (
              recentInquiriesPreview.map((inq) => {
                const c = embedOne(inq.customers);
                const stage =
                  embedOne(inq.sales_opportunities)?.funnel_stage ?? '';
                const label = funnelStageLabel(stage);
                return (
                  <li
                    key={inq.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {c?.full_name ?? '—'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c?.phone ?? '—'}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        funnelStageBadgeClass(stage)
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>

      <InquiryListCard
        inquiries={inquiries}
        loadingInquiries={loadingInquiries}
        loadInquiries={loadInquiries}
        units={units}
        navigateToBookingFromInquiry={navigateToBookingFromInquiry}
        headerExtra={
          <Button variant="outline" size="sm" asChild>
            <Link href="/crm/inquiry/list">Full-page list</Link>
          </Button>
        }
      />
    </div>
  );
}

function LeadSourceDonut({
  slices
}: {
  slices: { label: string; count: number; color: string }[];
}) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) {
    return (
      <div
        className="flex size-44 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-center text-[11px] leading-snug text-muted-foreground"
        aria-hidden
      >
        No source data
      </div>
    );
  }
  let accPct = 0;
  const gradientParts: string[] = [];
  for (const sl of slices) {
    const pct = (sl.count / total) * 100;
    const start = accPct;
    accPct += pct;
    gradientParts.push(`${sl.color} ${start}% ${accPct}%`);
  }
  return (
    <div className="relative mx-auto size-44 shrink-0 sm:mx-0">
      <div
        className="size-44 rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10"
        style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
      />
      <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-card text-center shadow-sm ring-1 ring-border">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sources
        </span>
        <span className="text-lg font-bold tabular-nums leading-none text-foreground">
          {total}
        </span>
      </div>
    </div>
  );
}

export default function InquiryPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground">
          Loading inquiries…
        </div>
      }
    >
      <InquiryPageContent />
    </Suspense>
  );
}
