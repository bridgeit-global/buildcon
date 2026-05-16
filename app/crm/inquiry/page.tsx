'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { embedOne, inquiryProjectLabel } from './inquiry-helpers';
import type { InquiryRowDb } from './inquiry-types';

/** Light teal shades for donut + legend (Tailwind teal 100–400). */
const LEAD_SOURCE_COLOR: Record<string, string> = {
  Website: '#99f6e4',
  'Social Media': '#5eead4',
  'Walk-in': '#2dd4bf',
  Direct: '#14b8a6  ',
  Broker: '#ccfbf1',
  Referral: '#b2f5ea'
};

function leadSourceColor(label: string, index: number) {
  const trimmed = String(label || '').trim();
  if (LEAD_SOURCE_COLOR[trimmed]) return LEAD_SOURCE_COLOR[trimmed];
  const l = trimmed.toLowerCase();
  if (l.includes('whatsapp')) return '#5eead4';
  if (l.includes('facebook') || l.includes('instagram')) return '#2dd4bf';
  if (l.includes('website')) return '#99f6e4';
  const palette = ['#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6'];
  return palette[index % palette.length];
}

function funnelStageBadgeClass(stage: string) {
  const s = String(stage || '').trim();
  if (!s || s === 'Enquiry') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (s === 'Qualified') {
    return 'border-teal-200 bg-teal-50 text-teal-900';
  }
  if (s === 'Site Visit') {
    return 'border-green-200 bg-green-50 text-green-900';
  }
  if (s === 'Lost') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (s === 'Won' || s === 'Booking') {
    return 'border-teal-300 bg-teal-100 text-teal-950';
  }
  return 'border-slate-200 bg-slate-50 text-slate-800';
}

function funnelStageLabel(stage: string) {
  const s = String(stage || '').trim();
  return s || 'New';
}

function InquiryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [error, setError] = useState('');
  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);

  const loadInquiries = useCallback(async () => {
    setLoadingInquiries(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(
        `
        id,
        project_id,
        projects ( name ),
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
        units ( unit_code, wing_name, project_id, projects ( name ) ),
        profiles ( name ),
        sales_opportunities (
          id,
          funnel_stage,
          assigned_to,
          sales_pipeline_stages ( id, stage, payload, updated_at ),
          sales_follow_ups ( id, due_at, note, completed_at ),
          sales_site_visits ( id, scheduled_at, status, outcome )
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      setError(qErr.message);
      setInquiries([]);
    } else {
      setInquiries((data ?? []) as unknown as InquiryRowDb[]);
    }
    setLoadingInquiries(false);
  }, [supabase]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    const q = searchParams.get('pipelineInquiry')?.trim();
    if (!q || loadingInquiries) return;
    const exists = inquiries.some((i) => i.id === q);
    if (exists) {
      router.replace(
        `/crm/inquiry/new?inquiry=${encodeURIComponent(q)}`,
        {
          scroll: false
        }
      );
    }
  }, [
    searchParams,
    inquiries,
    loadingInquiries,
    router
  ]);

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
    () => inquiries.slice(0, 4),
    [inquiries]
  );

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
        <Button className="gap-1" asChild>
          <Link href="/crm/inquiry/new">+ Add enquiry</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            {
              title: 'Total enquiries',
              value: kpiStats.total,
              hint: `${kpiStats.createdToday} today`,
              href: '/crm/inquiry/list',
              ariaLabel: 'Open the full enquiry list'
            },
            {
              title: 'New',
              value: kpiStats.newLeads,
              hint: 'Enquiry or no opportunity',
              href: '/crm/inquiry/list?stage=new',
              ariaLabel: 'Open list filtered to new enquiries'
            },
            {
              title: 'Qualified',
              value: kpiStats.qualified,
              hint: 'In funnel',
              href: '/crm/inquiry/list?stage=Qualified',
              ariaLabel: 'Open list filtered to qualified stage'
            },
            {
              title: 'Converted',
              value: kpiStats.converted,
              hint: 'Booking or Won',
              href: '/crm/inquiry/list?stage=converted',
              ariaLabel: 'Open list filtered to won and booking'
            }
          ] as const
        ).map((tile, tileIndex) => {
          const featured = tileIndex === 0;
          const body = (
            <>
              <div
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wide',
                  featured ? 'text-white/80' : 'text-muted-foreground'
                )}
              >
                {tile.title}
              </div>
              <div
                className={cn(
                  'mt-1 text-2xl font-bold tabular-nums',
                  featured ? 'text-white' : 'text-teal-700'
                )}
              >
                {loadingInquiries ? '…' : tile.value}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-[10px]',
                  featured ? 'text-white/75' : 'text-muted-foreground'
                )}
              >
                {tile.hint}
              </div>
            </>
          );
          return (
            <Link
              key={tile.title}
              href={tile.href}
              aria-label={tile.ariaLabel}
              className={cn(
                'block rounded-xl px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                featured
                  ? 'bg-teal-600 text-white shadow-md hover:bg-teal-700'
                  : 'border border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:bg-slate-50/80'
              )}
            >
              {body}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="gap-4 border-slate-200/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Enquiry source
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Lead source for loaded enquiries across projects (up to 500).
              </p>
            </div>
            <Link
              href="/crm/inquiry/list"
              className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              View list
            </Link>
          </div>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <LeadSourceDonut slices={leadSourceSlices} />
            <ul className="w-full max-w-sm flex-1 space-y-2 text-sm">
              {leadSourceSlices.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  {loadingInquiries
                    ? 'Loading…'
                    : 'No enquiries yet.'}
                </li>
              ) : (
                leadSourceSlices.map((s) => (
                  <li
                    key={s.label}
                    className="border-b border-border/60 pb-2 last:border-0 last:pb-0"
                  >
                    <Link
                      href={`/crm/inquiry/list?source=${encodeURIComponent(s.label)}`}
                      className="-mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open list filtered by lead source ${s.label}`}
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
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card className="gap-4 border-slate-200/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Recent enquiries
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Latest by created date.
              </p>
            </div>
            <Link
              href="/crm/inquiry/list"
              className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              View list
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {recentInquiriesPreview.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {loadingInquiries
                  ? 'Loading…'
                  : 'No enquiries yet.'}
              </li>
            ) : (
              recentInquiriesPreview.map((inq) => {
                const c = embedOne(inq.customers);
                const stage =
                  embedOne(inq.sales_opportunities)?.funnel_stage ?? '';
                const label = funnelStageLabel(stage);
                const projectName = inquiryProjectLabel(inq);
                return (
                  <li key={inq.id} className="p-0">
                    <Link
                      href={`/crm/inquiry/new?inquiry=${encodeURIComponent(inq.id)}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      aria-label={`Open enquiry workspace for ${c?.full_name ?? 'enquiry'}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {c?.full_name ?? '—'}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c?.phone ?? '—'}
                        </div>
                        {projectName ? (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {projectName}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          funnelStageBadgeClass(stage)
                        )}
                      >
                        {label}
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>

    </div>
  );
}

const DONUT_SIZE_CLASS = 'size-52 sm:size-56';

function LeadSourceDonut({
  slices
}: {
  slices: { label: string; count: number; color: string }[];
}) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) {
    return (
      <div
        className={cn(
          DONUT_SIZE_CLASS,
          'flex shrink-0 items-center justify-center rounded-full border border-dashed border-border text-center text-xs leading-snug text-muted-foreground'
        )}
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
    <div
      className={cn('relative mx-auto shrink-0 sm:mx-0', DONUT_SIZE_CLASS)}
    >
      <div
        className={cn(
          DONUT_SIZE_CLASS,
          'rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10'
        )}
        style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
      />
      <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-card text-center shadow-sm ring-1 ring-border">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sources
        </span>
        <span className="text-xl font-bold tabular-nums leading-none text-foreground">
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
