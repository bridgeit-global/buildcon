'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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

function normalizeSearch(s: string) {
  return s.trim().toLowerCase();
}

function SearchablePicker<T extends { id: string }>({
  label,
  itemCount,
  items,
  selectedId,
  onSelect,
  emptyMessage,
  searchPlaceholder,
  triggerPlaceholder,
  matchItem,
  renderTriggerSummary,
  renderRow
}: {
  label: string;
  itemCount: number;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyMessage: string;
  searchPlaceholder: string;
  triggerPlaceholder: string;
  matchItem: (item: T, query: string) => boolean;
  renderTriggerSummary: (item: T) => ReactNode;
  renderRow: (item: T) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = items.find((x) => x.id === selectedId) ?? null;
  const q = normalizeSearch(query);

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((item) => matchItem(item, q));
  }, [items, q, matchItem]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  return (
    <div className="space-y-1.5">
      <Label>
        {label}{' '}
        <span className="font-normal text-muted-foreground">({itemCount})</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex gap-2">
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-auto min-h-10 w-full flex-1 justify-between px-3 py-2 text-left font-normal"
            >
              <span className="min-w-0 flex-1 truncate">
                {selected ? (
                  renderTriggerSummary(selected)
                ) : (
                  <span className="text-muted-foreground">
                    {triggerPlaceholder}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          {selected ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              title="Clear"
              onClick={(e) => {
                e.preventDefault();
                onSelect('');
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <PopoverContent
          className="w-[min(calc(100vw-2rem),28rem)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div
            className="max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain p-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filtered.map((item) => {
                const isSel = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors',
                      'hover:bg-accent focus-visible:bg-accent',
                      isSel && 'bg-accent'
                    )}
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        isSel ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">{renderRow(item)}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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

  const matchUnit = useCallback((u: UnitOption, q: string) => {
    const blob = [
      u.unit_code,
      u.wing_name,
      String(u.floor),
      u.unit_type ?? '',
      String(u.area ?? ''),
      String(u.rate ?? ''),
      u.status
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  }, []);

  const matchCustomer = useCallback((c: CustomerOption, q: string) => {
    const blob = [c.full_name, c.phone ?? '', c.email ?? '']
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  }, []);

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
            <SearchablePicker<UnitOption>
              label="Available units"
              itemCount={units.length}
              items={units}
              selectedId={unitId}
              onSelect={setUnitId}
              emptyMessage="No units match your search."
              searchPlaceholder="Search by code, wing, floor, type…"
              triggerPlaceholder="Choose an available unit…"
              matchItem={matchUnit}
              renderTriggerSummary={(u) => (
                <span className="block truncate">
                  <span className="font-medium text-foreground">
                    {u.unit_code}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {u.wing_name} · F{u.floor}
                    {u.unit_type ? ` · ${u.unit_type}` : ''}
                  </span>
                </span>
              )}
              renderRow={(u) => (
                <span className="block">
                  <span className="font-medium text-foreground">
                    {u.unit_code}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {u.wing_name} · Floor {u.floor}
                    {u.unit_type ? ` · ${u.unit_type}` : ''}
                    {u.area != null ? ` · ${u.area} sq.ft` : ''}
                    {u.rate != null
                      ? ` · ₹${u.rate.toLocaleString()}/sq.ft`
                      : ''}
                  </span>
                </span>
              )}
            />
          </div>

          <div className="col-span-2">
            <SearchablePicker<CustomerOption>
              label="Customer"
              itemCount={customers.length}
              items={customers}
              selectedId={customerId}
              onSelect={setCustomerId}
              emptyMessage="No customers match your search."
              searchPlaceholder="Search by name, phone, email…"
              triggerPlaceholder="Choose a customer…"
              matchItem={matchCustomer}
              renderTriggerSummary={(c) => (
                <span className="block truncate">
                  <span className="font-medium text-foreground">
                    {c.full_name}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {c.phone ?? '—'}
                  </span>
                </span>
              )}
              renderRow={(c) => (
                <span className="block">
                  <span className="font-medium text-foreground">
                    {c.full_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              )}
            />
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

