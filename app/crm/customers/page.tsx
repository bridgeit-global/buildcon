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
  broker_id: string | null;
  brokers: { full_name: string } | { full_name: string }[] | null;
  interested_in: string | null;
  projects: { name: string } | { name: string }[] | null;
  units:
    | { unit_code: string; wing_name: string }
    | { unit_code: string; wing_name: string }[]
    | null;
};

type AddressRow = {
  id: string;
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

type NomineeRow = {
  id: string;
  nominee_name: string | null;
  relationship: string | null;
  nominee_dob: string | null;
};

type BankRow = {
  id: string;
  bank_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  branch: string | null;
};

type KycDocRow = {
  id: string;
  doc_type: string;
  verified_status: string;
  uploaded_at: string;
};

type DetailTab = 'profile' | 'kyc' | 'address' | 'nominee' | 'bank';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function initialsFromName(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="w-[140px] shrink-0 text-xs font-medium text-gray-500">
        {label}
      </div>
      <div className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'kyc', label: 'KYC' },
  { id: 'address', label: 'Address' },
  { id: 'nominee', label: 'Nominee' },
  { id: 'bank', label: 'Bank' }
];

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

  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [nominees, setNominees] = useState<NomineeRow[]>([]);
  const [bankRows, setBankRows] = useState<BankRow[]>([]);
  const [kycDocs, setKycDocs] = useState<KycDocRow[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('customers')
      .select(
        'id,full_name,phone,email,dob,occupation,nationality,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (qErr) setError(qErr.message);
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
          projects ( name ),
          units ( unit_code, wing_name )
        `
        )
        .eq('customer_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled) {
        if (qErr) setCustomerInquiries([]);
        else
          setCustomerInquiries((data ?? []) as unknown as CustomerInquiryRow[]);
        setLoadingInquiries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  useEffect(() => {
    if (!selectedId) {
      setAddresses([]);
      setNominees([]);
      setBankRows([]);
      setKycDocs([]);
      setLoadingExtras(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingExtras(true);
      const [a, n, b, k] = await Promise.all([
        supabase
          .from('customer_addresses')
          .select('id,kind,address_line1,city,state,pin')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: true }),
        supabase
          .from('customer_nominees')
          .select('id,nominee_name,relationship,nominee_dob')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_bank_details')
          .select('id,bank_name,account_no,ifsc,branch')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_kyc_documents')
          .select('id,doc_type,verified_status,uploaded_at')
          .eq('customer_id', selectedId)
          .order('uploaded_at', { ascending: false })
      ]);
      if (cancelled) return;
      setAddresses((a.data ?? []) as AddressRow[]);
      setNominees((n.data ?? []) as NomineeRow[]);
      setBankRows((b.data ?? []) as BankRow[]);
      setKycDocs((k.data ?? []) as KycDocRow[]);
      setLoadingExtras(false);
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

  const latestInquiry = customerInquiries[0] ?? null;
  const latestBrokerName =
    latestInquiry &&
    String(latestInquiry.lead_source || '').toLowerCase() === 'broker'
      ? embedOne(latestInquiry.brokers)?.full_name ?? null
      : null;

  async function createCustomer() {
    setSaving(true);
    setError('');
    try {
      const { data, error: insErr } = await supabase
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

      if (insErr) throw insErr;
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
      <Card className="flex flex-col gap-3 overflow-hidden p-3">
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

        <div className="-mx-3 overflow-auto px-3">
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
                <div className="line-clamp-1 text-sm font-semibold text-gray-900">
                  {c.full_name}
                </div>
                <div className="line-clamp-1 text-xs text-gray-500">
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
            <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 pb-4">
              <div
                className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 border-blue-200 bg-blue-50 text-lg font-bold text-blue-600"
                aria-hidden
              >
                {initialsFromName(selected.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-gray-900">
                  {selected.full_name}
                </div>
                <div className="text-sm text-gray-500">{selected.id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {latestInquiry ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        String(latestInquiry.lead_source || '').toLowerCase() ===
                        'broker'
                          ? 'border border-teal-200 bg-teal-50 text-teal-800'
                          : 'border border-gray-200 bg-gray-50 text-gray-700'
                      }`}
                    >
                      Latest source: {latestInquiry.lead_source}
                      {latestBrokerName ? ` · ${latestBrokerName}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                      No inquiries yet
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
              {DETAIL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={`shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors ${
                    detailTab === t.id
                      ? 'border border-b-0 border-gray-200 bg-white text-blue-600'
                      : 'border border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'profile' ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-white">
                  <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-700">
                    Contact & identity
                  </div>
                  <div className="px-4 py-1">
                    <InfoRow label="Phone" value={selected.phone ?? '—'} />
                    <InfoRow label="Email" value={selected.email ?? '—'} />
                    <InfoRow
                      label="Date of birth"
                      value={selected.dob ?? '—'}
                    />
                    <InfoRow
                      label="Occupation"
                      value={selected.occupation ?? '—'}
                    />
                    <InfoRow
                      label="Nationality"
                      value={selected.nationality ?? '—'}
                    />
                    <InfoRow
                      label="Customer since"
                      value={new Date(selected.created_at).toLocaleString()}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Sales inquiries
                  </div>
                  <div className="text-xs text-gray-500">
                    Per-project leads; broker appears when source is Broker.
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                          <th className="px-3 py-2 font-medium">When</th>
                          <th className="px-3 py-2 font-medium">Project</th>
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Broker</th>
                          <th className="px-3 py-2 font-medium">Interest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingInquiries ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              Loading…
                            </td>
                          </tr>
                        ) : customerInquiries.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              No inquiries yet.
                            </td>
                          </tr>
                        ) : (
                          customerInquiries.map((row) => {
                            const u = embedOne(row.units);
                            const brokerNm = embedOne(row.brokers)?.full_name;
                            const showBroker =
                              String(row.lead_source || '').toLowerCase() ===
                              'broker';
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-gray-100"
                              >
                                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                                  {new Date(row.created_at).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-gray-900">
                                  {embedOne(row.projects)?.name ?? '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-900">
                                  {u
                                    ? `${u.unit_code} · ${u.wing_name}`
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {row.lead_source}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {showBroker ? brokerNm ?? '—' : '—'}
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
              </div>
            ) : null}

            {detailTab === 'kyc' ? (
              <div className="rounded-lg border bg-white">
                <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-700">
                  KYC documents
                </div>
                {loadingExtras ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Loading…
                  </div>
                ) : kycDocs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No documents on file. Uploads can be recorded once storage
                    is wired to this table.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                          <th className="px-3 py-2 font-medium">Document</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Uploaded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycDocs.map((d) => (
                          <tr
                            key={d.id}
                            className="border-b border-gray-100"
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {d.doc_type}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {d.verified_status}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                              {new Date(d.uploaded_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {detailTab === 'address' ? (
              <div className="flex flex-col gap-3">
                {loadingExtras ? (
                  <div className="text-sm text-gray-500">Loading…</div>
                ) : addresses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No address saved for this customer.
                  </div>
                ) : (
                  addresses.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border bg-white p-4"
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {a.kind === 'permanent' ? 'Permanent' : 'Current'}{' '}
                        address
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-900">
                        <div>{a.address_line1 ?? '—'}</div>
                        <div className="text-gray-600">
                          {[a.city, a.state, a.pin].filter(Boolean).join(', ') ||
                            '—'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {detailTab === 'nominee' ? (
              <div className="rounded-lg border bg-white">
                {loadingExtras ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Loading…
                  </div>
                ) : nominees.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No nominee records.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {nominees.map((n) => (
                      <div key={n.id} className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {n.nominee_name ?? '—'}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {n.relationship ?? '—'} · DOB{' '}
                          {n.nominee_dob
                            ? new Date(n.nominee_dob).toLocaleDateString()
                            : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {detailTab === 'bank' ? (
              <div className="rounded-lg border bg-white">
                {loadingExtras ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Loading…
                  </div>
                ) : bankRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No bank details on file.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {bankRows.map((b) => (
                      <div key={b.id} className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {b.bank_name ?? '—'}
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                          <div>Account: {b.account_no ?? '—'}</div>
                          <div>IFSC: {b.ifsc ?? '—'}</div>
                          <div className="sm:col-span-2">
                            Branch: {b.branch ?? '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a customer.</div>
        )}
      </Card>
    </div>
  );
}
