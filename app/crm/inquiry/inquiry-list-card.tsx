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

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                'Inquiry ID',
                'Created',
                'Customer',
                'Phone',
                'Email',
                'Lead source',
                'Broker',
                'Unit',
                'Stage',
                'Parking',
                'Seller',
                'Actions'
              ].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-2 py-6 text-muted-foreground">
                  {loadingInquiries
                    ? 'Loading…'
                    : 'No inquiries found for this project.'}
                </td>
              </tr>
            ) : (
              filtered.map((inq) => {
                const u = embedOne(inq.units);
                const unitLabel =
                  u != null
                    ? unitDisplayName(u)
                    : unitNameById.get(inq.unit_id) || inq.unit_id || '—';
                const sellerName = embedOne(inq.profiles)?.name ?? '—';
                return (
                  <tr key={inq.id} className="border-b border-border/80">
                    <td className="whitespace-nowrap px-2 py-2 text-xs font-semibold">
                      {inquiryReference(inq.id)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                      {inq.created_at
                        ? new Date(inq.created_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {embedOne(inq.customers)?.full_name ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {embedOne(inq.customers)?.phone ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {embedOne(inq.customers)?.email ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {inq.lead_source ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {String(inq.lead_source || '').toLowerCase() === 'broker'
                        ? embedOne(inq.brokers)?.full_name ?? '—'
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold">
                      {unitLabel}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                      {embedOne(inq.sales_opportunities)?.funnel_stage ?? '—'}
                    </td>
                    <td className="max-w-[220px] px-2 py-2 text-[11px] leading-snug">
                      <div className="font-medium text-foreground">
                        {inq.parking_required === 'Yes'
                          ? `Ask × ${inq.parking_count}`
                          : 'No'}
                      </div>
                      {inq.parking_slots_available != null &&
                      inq.parking_slots_available > 0 ? (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          At save: {inq.parking_slots_available} slots
                          {inq.parking_rate_snapshot != null &&
                          inq.parking_rate_snapshot > 0
                            ? ` @ ₹${inq.parking_rate_snapshot.toLocaleString(
                                'en-IN'
                              )}/slot`
                            : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {sellerName}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <div className="flex flex-wrap gap-1">
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
