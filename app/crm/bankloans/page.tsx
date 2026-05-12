'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
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
import { formatInr } from '../inr-format';

type LoanRow = {
  id: string;
  customer_id: string;
  bank: string | null;
  amount: number | null;
  status: string;
  applied_at: string | null;
  updated_at: string;
};

type CustomerOption = { id: string; full_name: string; phone: string | null };

const STATUSES = ['Application', 'Document Pending', 'Sanctioned', 'Disbursed'];

export default function BankLoansPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersById, setCustomersById] = useState<
    Record<string, CustomerOption>
  >({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    customer_id: '',
    bank: 'HDFC Bank',
    amount: '3500000',
    status: 'Application',
    applied_at: ''
  });

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');

    const [{ data: loanData, error: loanErr }, { data: custData, error: custErr }] =
      await Promise.all([
        supabase
          .from('loan_cases')
          .select('id,customer_id,bank,amount,status,applied_at,updated_at')
          .eq('project_id', activeProjectId)
          .order('updated_at', { ascending: false })
          .limit(200),
        supabase
          .from('customers')
          .select('id,full_name,phone')
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

    if (loanErr) setError(loanErr.message);
    if (custErr) setError(custErr.message);

    const cRows = (custData ?? []) as CustomerOption[];
    setCustomers(cRows);
    const map: Record<string, CustomerOption> = {};
    cRows.forEach((c) => (map[c.id] = c));
    setCustomersById(map);

    setLoans((loanData ?? []) as LoanRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  async function createLoan() {
    if (!activeProjectId || !draft.customer_id) return;
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('loan_cases')
        .insert({
          project_id: activeProjectId,
          customer_id: draft.customer_id,
          bank: draft.bank || null,
          amount: draft.amount ? Number(draft.amount) : null,
          status: draft.status,
          applied_at: draft.applied_at || null
        })
        .select('id,customer_id,bank,amount,status,applied_at,updated_at')
        .single();
      if (error) throw error;
      setLoans((l) => [data as LoanRow, ...l]);
      setOpen(false);
      setDraft({
        customer_id: '',
        bank: 'HDFC Bank',
        amount: '3500000',
        status: 'Application',
        applied_at: ''
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create loan case');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setError('');
    const { error } = await supabase
      .from('loan_cases')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setError(error.message);
    await load();
  }

  const summary = {
    total: loans.length,
    sanctioned: loans.filter((l) => l.status === 'Sanctioned').length,
    pending: loans.filter((l) => l.status !== 'Sanctioned' && l.status !== 'Disbursed')
      .length,
    disbursed: loans.filter((l) => l.status === 'Disbursed').length
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Loan cases</div>
            <div className="text-xs text-gray-500">
              Track customer home-loan progress per project.
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Add case</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Add loan case</DialogTitle>
                </DialogHeader>
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Customer</Label>
                    <select
                      value={draft.customer_id}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, customer_id: e.target.value }))
                      }
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
                    <Label>Bank</Label>
                    <select
                      value={draft.bank}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, bank: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {['HDFC Bank', 'SBI Bank', 'Axis Bank', 'ICICI Bank'].map(
                        (b) => (
                          <option key={b}>{b}</option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input
                      value={draft.amount}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, amount: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, status: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Applied at</Label>
                    <Input
                      type="date"
                      value={draft.applied_at}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, applied_at: e.target.value }))
                      }
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
                    onClick={createLoan}
                    disabled={saving || !draft.customer_id}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-4 gap-3">
          {[
            ['Total', summary.total],
            ['Sanctioned', summary.sanctioned],
            ['Pending', summary.pending],
            ['Disbursed', summary.disbursed]
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">{k}</div>
              <div className="text-lg font-semibold text-gray-900">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {[
                  'Customer',
                  'Bank',
                  'Amount',
                  'Status',
                  'Applied at',
                  'Actions'
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {customersById[l.customer_id]?.full_name ?? l.customer_id}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{l.bank ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {l.amount != null
                      ? `₹ ${formatInr(Number(l.amount), { maximumFractionDigits: 0 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-1 text-xs">
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{l.applied_at ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={l.status}
                      onChange={(e) => updateStatus(l.id, e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!loading && loans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No loan cases yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

