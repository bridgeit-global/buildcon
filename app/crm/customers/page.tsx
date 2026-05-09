'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  occupation: string | null;
  nationality: string | null;
  created_at: string;
};

type CustomerInquiryRow = {
  id: string;
  created_at: string;
  lead_source: string;
  interested_in: string | null;
  projects: { name: string } | { name: string }[] | null;
  units:
    | { unit_code: string; wing_name: string }
    | { unit_code: string; wing_name: string }[]
    | null;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function CustomersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    full_name: '',
    phone: '',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian'
  });

  const [customerInquiries, setCustomerInquiries] = useState<
    CustomerInquiryRow[]
  >([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('customers')
      .select(
        'id,full_name,phone,email,dob,occupation,nationality,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    const rows = (data ?? []) as CustomerRow[];
    setCustomers(rows);
    setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setCustomerInquiries([]);
      setLoadingInquiries(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingInquiries(true);
      const { data, error } = await supabase
        .from('sales_inquiries')
        .select(
          `
          id,
          created_at,
          lead_source,
          interested_in,
          projects ( name ),
          units ( unit_code, wing_name )
        `
        )
        .eq('customer_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled) {
        if (error) setCustomerInquiries([]);
        else
          setCustomerInquiries((data ?? []) as unknown as CustomerInquiryRow[]);
        setLoadingInquiries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  const filtered = customers.filter((c) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      c.full_name.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.id.toLowerCase().includes(s)
    );
  });

  const selected =
    filtered.find((c) => c.id === selectedId) ??
    customers.find((c) => c.id === selectedId) ??
    null;

  async function createCustomer() {
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          full_name: draft.full_name,
          phone: draft.phone || null,
          email: draft.email || null,
          dob: draft.dob || null,
          occupation: draft.occupation || null,
          nationality: draft.nationality || null
        })
        .select(
          'id,full_name,phone,email,dob,occupation,nationality,created_at'
        )
        .single();

      if (error) throw error;
      const row = data as CustomerRow;
      setCustomers((cs) => [row, ...cs]);
      setSelectedId(row.id);
      setOpen(false);
      setDraft({
        full_name: '',
        phone: '',
        email: '',
        dob: '',
        occupation: '',
        nationality: 'Indian'
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4">
      <Card className="p-3 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Customers</div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading…' : `${filtered.length} shown`}
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add customer</DialogTitle>
              </DialogHeader>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Full name</Label>
                  <Input
                    value={draft.full_name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, full_name: e.target.value }))
                    }
                    placeholder="e.g. Mr. Amit Deshmukh"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={draft.phone}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, phone: e.target.value }))
                    }
                    placeholder="+91 …"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={draft.email}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, email: e.target.value }))
                    }
                    placeholder="name@email.com"
                  />
                </div>
                <div>
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={draft.dob}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, dob: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Occupation</Label>
                  <Input
                    value={draft.occupation}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, occupation: e.target.value }))
                    }
                    placeholder="Salaried / Business…"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Nationality</Label>
                  <select
                    value={draft.nationality}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, nationality: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option>Indian</option>
                    <option>NRI</option>
                    <option>Foreign National</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={createCustomer}
                  disabled={saving || !draft.full_name}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
        />

        <div className="overflow-auto -mx-3 px-3">
          <div className="flex flex-col gap-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  selectedId === c.id
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 line-clamp-1">
                  {c.full_name}
                </div>
                <div className="text-xs text-gray-500 line-clamp-1">
                  {c.phone ?? '—'}
                </div>
              </button>
            ))}
            {!loading && filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No customers found.
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Card>

      <Card className="p-5">
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {selected ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {selected.full_name}
              </div>
              <div className="text-sm text-gray-500">{selected.id}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Phone', selected.phone ?? '—'],
                ['Email', selected.email ?? '—'],
                ['DOB', selected.dob ?? '—'],
                ['Occupation', selected.occupation ?? '—'],
                ['Nationality', selected.nationality ?? '—'],
                ['Created', new Date(selected.created_at).toLocaleString()]
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-gray-500">{k}</div>
                  <div className="text-sm font-semibold text-gray-900">{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-900">
                Sales inquiries
              </div>
              <div className="text-xs text-gray-500">
                Project-scoped leads linked to this customer (from Inquiry).
              </div>
              <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Unit</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingInquiries ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-4 text-center text-gray-500"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : customerInquiries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-4 text-center text-gray-500"
                        >
                          No inquiries yet.
                        </td>
                      </tr>
                    ) : (
                      customerInquiries.map((row) => {
                        const u = embedOne(row.units);
                        return (
                          <tr key={row.id} className="border-b border-gray-100">
                            <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-gray-900">
                              {embedOne(row.projects)?.name ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-900">
                              {u ? `${u.unit_code} · ${u.wing_name}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {row.lead_source}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {row.interested_in ?? '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              KYC uploads, address, nominee, and bank details are next — the
              tables are already in `supabase/schema.sql` and we’ll wire these
              into this screen.
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a customer.</div>
        )}
      </Card>
    </div>
  );
}

