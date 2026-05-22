'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatInrCompactLacCr } from '@/app/crm/inr-format';
import { formatDisplayDate } from '@/lib/format-display-date';

type BookingRow = {
  id: string;
  created_at: string;
  booking_amount: number | null;
  project_id: string;
  unit_id: string;
  units: { unit_code: string } | { unit_code: string }[] | null;
  projects: { name: string } | { name: string }[] | null;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function PortalHomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
        try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setLinkedCustomerId(null);
        setBookings([]);
        setLoading(false);
        return;
      }

      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('linked_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      if (pErr) throw pErr;

      const cid = (prof as { linked_customer_id?: string | null } | null)
        ?.linked_customer_id;
      setLinkedCustomerId(cid ?? null);

      if (!cid) {
        setCustomerName(null);
        setBookings([]);
        setLoading(false);
        return;
      }

      const { data: cust } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', cid)
        .maybeSingle();
      setCustomerName((cust as { full_name?: string } | null)?.full_name ?? null);

      const { data: bRows, error: bErr } = await supabase
        .from('bookings')
        .select(
          `
          id,
          created_at,
          booking_amount,
          project_id,
          unit_id,
          units ( unit_code ),
          projects ( name )
        `
        )
        .eq('customer_id', cid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (bErr) throw bErr;
      setBookings((bRows ?? []) as BookingRow[]);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load portal');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
    );
  }

  if (!linkedCustomerId) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-900">
          Portal not linked
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Your staff account is not linked to a buyer record yet. Ask a Super
          Admin to set <span className="font-mono">linked_customer_id</span> on
          your profile (Users and Access → Portal linking).
        </p>
        <Link
          href="/crm/users"
          className="mt-3 inline-block text-sm font-semibold text-blue-700 underline"
        >
          Open staff CRM
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-900">Your bookings</div>
        <p className="mt-1 text-xs text-slate-500">
          {customerName ? customerName : 'Customer'} · read-only view of units
          and projects you are booked on.
        </p>
        <div className="mt-4 space-y-3">
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-500">No bookings found.</p>
          ) : (
            bookings.map((b) => {
              const u = embedOne(b.units);
              const p = embedOne(b.projects);
              return (
                <div
                  key={b.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="font-semibold text-slate-900">
                    {u?.unit_code ?? 'Unit'} · {p?.name ?? 'Project'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Booked {formatDisplayDate(b.created_at)}
                  </div>
                  {b.booking_amount != null && b.booking_amount > 0 ? (
                    <div className="mt-1 text-xs text-slate-700">
                      Token / booking amount:{' '}
                      {formatInrCompactLacCr(Number(b.booking_amount))} (₹{' '}
                      {Number(b.booking_amount).toLocaleString('en-IN')})
                    </div>
                  ) : null}
                  <Link
                    href={`/portal/bookings/${b.id}`}
                    className="mt-2 inline-block text-xs font-semibold text-blue-700 underline"
                  >
                    View schedule and receipts
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
