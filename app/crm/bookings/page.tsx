'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type UnitOption = {
  id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  area: number | null;
  rate: number | null;
  status: string;
};

type CustomerOption = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

export default function BookingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [unitId, setUnitId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentMode, setPaymentMode] = useState('Home Loan');
  const [loanBank, setLoanBank] = useState('HDFC Bank');
  const [bookingAmount, setBookingAmount] = useState('500000');

  const [creating, setCreating] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');

    const [{ data: uData, error: uErr }, { data: cData, error: cErr }] =
      await Promise.all([
        supabase
          .from('units')
          .select(
            'id,unit_code,wing_name,floor,unit_type,area,rate,status,project_id'
          )
          .eq('project_id', activeProjectId)
          .eq('status', 'A')
          .order('wing_name', { ascending: true })
          .order('floor', { ascending: false })
          .order('unit_no', { ascending: true })
          .limit(500),
        supabase
          .from('customers')
          .select('id,full_name,phone,email')
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

    if (uErr) setError(uErr.message);
    if (cErr) setError(cErr.message);
    setUnits((uData ?? []) as UnitOption[]);
    setCustomers((cData ?? []) as CustomerOption[]);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  async function createBooking() {
    if (!activeProjectId || !unitId || !customerId) return;
    setCreating(true);
    setError('');
    setCreatedBookingId(null);
    try {
      const res = await fetch('/api/crm/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          unitId,
          customerId,
          paymentMode,
          loanBank: paymentMode === 'Home Loan' ? loanBank : null,
          bookingAmount: bookingAmount ? Number(bookingAmount) : null
        })
      });
      const json = (await res.json()) as { bookingId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to create booking');
      setCreatedBookingId(json.bookingId ?? null);
      setUnitId('');
      setCustomerId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create booking');
    } finally {
      setCreating(false);
    }
  }

  const selectedUnit = units.find((u) => u.id === unitId) ?? null;
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Create booking
            </div>
            <div className="text-xs text-gray-500">
              Select an available unit and a customer.
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {createdBookingId ? (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Booking created: <strong>{createdBookingId}</strong>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Available units ({units.length})</Label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select unit…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code} · {u.wing_name} · F{u.floor} · {u.unit_type ?? '—'}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <Label>Customer ({customers.length})</Label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.phone ?? '—'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Payment mode</Label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {['Cash', 'Home Loan', 'Construction Linked', 'Down Payment'].map(
                (m) => (
                  <option key={m}>{m}</option>
                )
              )}
            </select>
          </div>
          <div>
            <Label>Loan bank</Label>
            <select
              value={loanBank}
              onChange={(e) => setLoanBank(e.target.value)}
              disabled={paymentMode !== 'Home Loan'}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              {['HDFC Bank', 'SBI Bank', 'Axis Bank', 'ICICI Bank'].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label>Booking amount (₹)</Label>
            <Input
              value={bookingAmount}
              onChange={(e) => setBookingAmount(e.target.value)}
              placeholder="500000"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs font-semibold text-gray-500">Unit</div>
            {selectedUnit ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold text-gray-900">
                  {selectedUnit.unit_code}
                </div>
                <div className="text-gray-600">
                  {selectedUnit.wing_name} · Floor {selectedUnit.floor} ·{' '}
                  {selectedUnit.unit_type ?? '—'}
                </div>
                <div className="mt-1 text-gray-600">
                  Area: {selectedUnit.area ?? '—'} · Rate:{' '}
                  {selectedUnit.rate != null
                    ? `₹ ${selectedUnit.rate.toLocaleString()}/sq.ft`
                    : '—'}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">No unit selected.</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-xs font-semibold text-gray-500">Customer</div>
            {selectedCustomer ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold text-gray-900">
                  {selectedCustomer.full_name}
                </div>
                <div className="text-gray-600">
                  {selectedCustomer.phone ?? '—'} · {selectedCustomer.email ?? '—'}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">
                No customer selected.
              </div>
            )}
          </Card>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={createBooking}
            disabled={creating || !activeProjectId || !unitId || !customerId}
          >
            {creating ? 'Creating…' : 'Confirm booking'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

