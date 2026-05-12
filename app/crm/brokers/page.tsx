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

type BrokerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_no: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export default function BrokersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
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
    license_no: '',
    status: 'Active' as 'Active' | 'Inactive',
    notes: ''
  });

  async function load() {
    setLoading(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('brokers')
      .select(
        'id,full_name,phone,email,license_no,status,notes,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(300);
    if (qErr) setError(qErr.message);
    const rows = (data ?? []) as BrokerRow[];
    setBrokers(rows);
    setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = brokers.filter((b) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      b.full_name.toLowerCase().includes(s) ||
      b.phone?.toLowerCase().includes(s) ||
      b.email?.toLowerCase().includes(s) ||
      b.license_no?.toLowerCase().includes(s) ||
      b.id.toLowerCase().includes(s)
    );
  });

  const selected =
    filtered.find((b) => b.id === selectedId) ??
    brokers.find((b) => b.id === selectedId) ??
    null;

  async function createBroker() {
    setSaving(true);
    setError('');
    try {
      const { data, error: insErr } = await supabase
        .from('brokers')
        .insert({
          full_name: draft.full_name.trim(),
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          license_no: draft.license_no.trim() || null,
          status: draft.status,
          notes: draft.notes.trim() || null
        })
        .select(
          'id,full_name,phone,email,license_no,status,notes,created_at'
        )
        .single();

      if (insErr) throw insErr;
      const row = data as BrokerRow;
      setBrokers((list) => [row, ...list]);
      setSelectedId(row.id);
      setOpen(false);
      setDraft({
        full_name: '',
        phone: '',
        email: '',
        license_no: '',
        status: 'Active',
        notes: ''
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save broker');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4">
      <Card className="flex flex-col gap-3 overflow-hidden p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Brokers</div>
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
                <DialogTitle>Add broker</DialogTitle>
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
                    placeholder="Broker / agency name"
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
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, email: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label>RERA / license no.</Label>
                  <Input
                    value={draft.license_no}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, license_no: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as 'Active' | 'Inactive'
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <textarea
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, notes: e.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
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
                  onClick={createBroker}
                  disabled={saving || !draft.full_name.trim()}
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
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  selectedId === b.id
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="line-clamp-1 text-sm font-semibold text-gray-900">
                  {b.full_name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={
                      b.status === 'Active'
                        ? 'text-emerald-700'
                        : 'text-gray-400'
                    }
                  >
                    {b.status}
                  </span>
                  <span className="line-clamp-1">{b.phone ?? '—'}</span>
                </div>
              </button>
            ))}
            {!loading && filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No brokers yet.
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Card>

      <Card className="p-5">
        {error && !open ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {selected.full_name}
                </div>
                <div className="text-sm text-gray-500">{selected.id}</div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selected.status === 'Active'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border border-gray-200 bg-gray-100 text-gray-600'
                }`}
              >
                {selected.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Phone', selected.phone ?? '—'],
                ['Email', selected.email ?? '—'],
                ['License', selected.license_no ?? '—'],
                ['Created', new Date(selected.created_at).toLocaleString()],
                [
                  'Notes',
                  selected.notes?.trim() ? selected.notes : '—'
                ]
              ].map(([k, v]) => (
                <div
                  key={k}
                  className={`rounded-lg border bg-white p-3 ${
                    k === 'Notes' ? 'col-span-2' : ''
                  }`}
                >
                  <div className="text-xs text-gray-500">{k}</div>
                  <div className="text-sm font-semibold text-gray-900 whitespace-pre-wrap">
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              Link brokers to inquiries by choosing <strong>Broker</strong> as
              lead source on the Inquiry form, then pick this broker.
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a broker.</div>
        )}
      </Card>
    </div>
  );
}
