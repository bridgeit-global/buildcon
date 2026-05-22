'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatInr } from '@/app/crm/inr-format';

type ScheduleRow = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

type CollectionRow = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
};

export default function PortalBookingDetailPage() {
  const params = useParams();
  const bookingId = String(params?.id ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setReady(false);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        pageError('Not signed in');
        setLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('linked_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      const cid = (prof as { linked_customer_id?: string | null } | null)
        ?.linked_customer_id;
      setLinkedCustomerId(cid ?? null);

      const { data: b, error: bErr } = await supabase
        .from('bookings')
        .select('id,customer_id')
        .eq('id', bookingId)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!b) {
        pageError('Booking not found');
        setLoading(false);
        return;
      }
      const bcid = (b as { customer_id: string }).customer_id;
      if (!cid || cid !== bcid) {
        pageError('You do not have access to this booking.');
        setLoading(false);
        return;
      }

      const [{ data: sData, error: sErr }, { data: cData, error: cErr }] =
        await Promise.all([
          supabase
            .from('payment_schedules')
            .select('id,instalment_no,milestone,due_date,amount')
            .eq('booking_id', bookingId)
            .order('instalment_no', { ascending: true }),
          supabase
            .from('collections')
            .select('id,schedule_id,received_amount,received_at,mode,reference')
            .eq('booking_id', bookingId)
            .order('created_at', { ascending: false })
        ]);
      if (sErr) throw sErr;
      if (cErr) throw cErr;
      setSchedules((sData ?? []) as ScheduleRow[]);
      setCollections((cData ?? []) as CollectionRow[]);
      setReady(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [bookingId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const receivedBySchedule = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of collections) {
      if (c.schedule_id)
        m[c.schedule_id] = (m[c.schedule_id] || 0) + Number(c.received_amount);
    }
    return m;
  }, [collections]);

  if (loading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
    );
  }

  if (!ready) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-700">
          {!linkedCustomerId ? 'Access denied' : 'Could not load this booking'}
        </p>
        <Link href="/portal" className="mt-2 inline-block text-sm underline">
          Back to portal
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/portal" className="text-xs text-slate-600 underline">
        ← All bookings
      </Link>
      <Card className="p-4">
        <div className="text-sm font-semibold">Payment schedule</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Milestone</th>
                <th className="py-2 pr-2">Due</th>
                <th className="py-2 pr-2">Amount</th>
                <th className="py-2">Received</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const rec = receivedBySchedule[s.id] || 0;
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2">{s.instalment_no}</td>
                    <td className="py-2 pr-2 font-medium">{s.milestone}</td>
                    <td className="py-2 pr-2 text-slate-600">
                      {s.due_date ?? '—'}
                    </td>
                    <td className="py-2 pr-2">
                      ₹{' '}
                      {formatInr(Number(s.amount), { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 text-green-700">
                      ₹ {formatInr(rec, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-semibold">Receipts</div>
        <ul className="mt-2 space-y-2 text-sm">
          {collections.map((c) => (
            <li key={c.id} className="rounded border border-slate-100 bg-white p-2">
              <div className="font-semibold">
                ₹{' '}
                {formatInr(Number(c.received_amount), {
                  maximumFractionDigits: 0
                })}
              </div>
              <div className="text-xs text-slate-500">
                {c.mode ?? '—'} · {c.received_at ?? '—'} · {c.reference ?? '—'}
              </div>
            </li>
          ))}
          {collections.length === 0 ? (
            <li className="text-slate-500">No receipts yet.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
