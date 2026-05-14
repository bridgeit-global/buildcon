'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { embedOne, inquiryReference, unitDisplayName } from './inquiry-helpers';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';

export type InquiryListCardProps = {
  inquiries: InquiryRowDb[];
  loadingInquiries: boolean;
  loadInquiries: () => void | Promise<void>;
  units: UnitLabelRow[];
  navigateToBookingFromInquiry: (inq: InquiryRowDb) => void;
  /** e.g. link to dedicated list route from overview */
  headerExtra?: ReactNode;
};

export function InquiryListCard(props: InquiryListCardProps) {
  const {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    navigateToBookingFromInquiry,
    headerExtra
  } = props;
  const router = useRouter();
  const [query, setQuery] = useState('');

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) {
      if (!u?.id) continue;
      map.set(u.id, unitDisplayName(u));
    }
    return map;
  }, [units]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return inquiries;
    return inquiries.filter((inq) => {
      const c = embedOne(inq.customers);
      const name = String(c?.full_name || '').toLowerCase();
      const phone = String(c?.phone || '').toLowerCase();
      const email = String(c?.email || '').toLowerCase();
      const unitId = String(inq?.unit_id || '').toLowerCase();
      const u = embedOne(inq.units);
      const unitCode = String(u?.unit_code || '').toLowerCase();
      const source = String(inq.lead_source || '').toLowerCase();
      const ref = inquiryReference(inq.id).toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        unitId.includes(q) ||
        unitCode.includes(q) ||
        source.includes(q) ||
        ref.includes(q)
      );
    });
  }, [inquiries, query]);

  return (
    <Card className="p-4" id="inquiry-list">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Inquiry list
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Stored in the database with linked customer and unit.{' '}
            <span className="tabular-nums text-foreground">
              {loadingInquiries ? 'Loading…' : `${inquiries.length} loaded`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void loadInquiries()}
            disabled={loadingInquiries}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Label className="sr-only">Search inquiries</Label>
      <Input
        className="mt-4"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by customer, phone, email, source, or unit"
      />

      <div className="mt-4 flex flex-col gap-2" role="list">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {loadingInquiries
              ? 'Loading…'
              : 'No inquiries found for this project.'}
          </div>
        ) : (
          filtered.map((inq) => {
            const u = embedOne(inq.units);
            const unitLabel =
              u != null
                ? unitDisplayName(u)
                : unitNameById.get(inq.unit_id) || inq.unit_id || '—';
            const sellerName = embedOne(inq.profiles)?.name ?? '—';
            const c = embedOne(inq.customers);
            const stage =
              embedOne(inq.sales_opportunities)?.funnel_stage ?? '—';
            const brokerName =
              String(inq.lead_source || '').toLowerCase() === 'broker'
                ? embedOne(inq.brokers)?.full_name ?? '—'
                : null;

            return (
              <div
                key={inq.id}
                role="listitem"
                className="rounded-lg border border-border bg-muted/10 px-3 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {inquiryReference(inq.id)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {inq.created_at
                        ? new Date(inq.created_at).toLocaleString()
                        : '—'}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stage}
                  </div>
                </div>

                <div className="mt-2 text-sm font-medium text-foreground">
                  {c?.full_name ?? '—'}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{c?.phone ?? '—'}</span>
                  {c?.email ? <span className="break-all">{c.email}</span> : null}
                </div>

                <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Source</dt>
                    <dd className="min-w-0 font-medium text-foreground">
                      {inq.lead_source ?? '—'}
                    </dd>
                  </div>
                  {brokerName ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Broker</dt>
                      <dd className="min-w-0 font-medium text-foreground">
                        {brokerName}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-muted-foreground">Unit</dt>
                    <dd className="min-w-0 font-semibold text-foreground">
                      {unitLabel}
                    </dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-muted-foreground">Parking</dt>
                    <dd className="min-w-0 text-foreground">
                      <span className="font-medium">
                        {inq.parking_required === 'Yes'
                          ? `Ask × ${inq.parking_count}`
                          : 'No'}
                      </span>
                      {inq.parking_slots_available != null &&
                      inq.parking_slots_available > 0 ? (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          At save: {inq.parking_slots_available} slots
                          {inq.parking_rate_snapshot != null &&
                          inq.parking_rate_snapshot > 0
                            ? ` @ ₹${inq.parking_rate_snapshot.toLocaleString(
                                'en-IN'
                              )}/slot`
                            : ''}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-muted-foreground">Seller</dt>
                    <dd className="min-w-0 text-foreground">{sellerName}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      router.push(
                        `/crm/inquiry/pipeline/${encodeURIComponent(inq.id)}`
                      )
                    }
                  >
                    Pipeline
                  </Button>
                  {inq.unit_id?.trim() ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => navigateToBookingFromInquiry(inq)}
                    >
                      Booking
                      <ArrowRight className="size-3.5 opacity-90" />
                    </Button>
                  ) : (
                    <span className="self-center text-[10px] text-muted-foreground">
                      No unit
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
