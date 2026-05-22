'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import {
  brokerFormPayload,
  brokerFormSchema,
  EMPTY_BROKER_FORM,
  type BrokerFormValues
} from '@/lib/broker/broker-forms.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

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

  const [open, setOpen] = useState(false);
  /** When set, dialog is editing this broker; otherwise add flow. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<BrokerFormValues>({
    resolver: zodResolver(brokerFormSchema),
    defaultValues: EMPTY_BROKER_FORM,
    mode: 'onChange'
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = form;
  const status = watch('status');

  async function load() {
    setLoading(true);
        const { data, error: qErr } = await supabase
      .from('brokers')
      .select(
        'id,full_name,phone,email,license_no,status,notes,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(300);
    if (qErr) pageError(qErr.message);
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

  function rowToFormValues(b: BrokerRow): BrokerFormValues {
    const st = b.status === 'Inactive' ? 'Inactive' : 'Active';
    return {
      full_name: b.full_name,
      phone: b.phone ?? '',
      email: b.email ?? '',
      license_no: b.license_no ?? '',
      status: st,
      notes: b.notes ?? ''
    };
  }

  function openBrokerDialog(editing: BrokerRow | null) {
    setEditingId(editing?.id ?? null);
    reset(editing ? rowToFormValues(editing) : EMPTY_BROKER_FORM);
    setOpen(true);
  }

  function closeBrokerDialog() {
    setOpen(false);
    setEditingId(null);
    reset(EMPTY_BROKER_FORM);
  }

  const saveBroker = handleSubmit(async (values) => {
    setSaving(true);
        try {
      const payload = brokerFormPayload(values);

      if (editingId) {
        const { data, error: updErr } = await supabase
          .from('brokers')
          .update(payload)
          .eq('id', editingId)
          .select(
            'id,full_name,phone,email,license_no,status,notes,created_at'
          )
          .single();

        if (updErr) throw updErr;
        const row = data as BrokerRow;
        setBrokers((list) =>
          list.map((b) => (b.id === row.id ? row : b))
        );
        setSelectedId(row.id);
      } else {
        const { data, error: insErr } = await supabase
          .from('brokers')
          .insert(payload)
          .select(
            'id,full_name,phone,email,license_no,status,notes,created_at'
          )
          .single();

        if (insErr) throw insErr;
        const row = data as BrokerRow;
        setBrokers((list) => [row, ...list]);
        setSelectedId(row.id);
      }

      closeBrokerDialog();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save broker');
    } finally {
      setSaving(false);
    }
  }, () => pageError('Fix the highlighted fields before saving.'));

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

          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (!next) closeBrokerDialog();
            }}
          >
            <Button size="sm" onClick={() => openBrokerDialog(null)}>
              Add
            </Button>
            <DialogContent className="max-w-xl">
              <form onSubmit={(e) => void saveBroker(e)}>
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? 'Edit broker' : 'Add broker'}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FieldLabel required>Full name</FieldLabel>
                    <Input
                      {...register('full_name')}
                      aria-invalid={errors.full_name ? true : undefined}
                      placeholder="Broker / agency name"
                      className="mt-1"
                    />
                    <FormFieldError message={errors.full_name?.message} />
                  </div>
                  <PhoneInputField
                    value={watch('phone')}
                    onChange={(v) =>
                      setValue('phone', v, { shouldValidate: true })
                    }
                    error={errors.phone?.message}
                  />
                  <EmailInputField
                    value={watch('email')}
                    onChange={(v) =>
                      setValue('email', v, { shouldValidate: true })
                    }
                    error={errors.email?.message}
                  />
                  <div className="col-span-2">
                    <Label>RERA / license no.</Label>
                    <Input
                      {...register('license_no')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onValueChange={(v) =>
                        setValue('status', v as 'Active' | 'Inactive', {
                          shouldValidate: true
                        })
                      }
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      {...register('notes')}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeBrokerDialog}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
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
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {selected.full_name}
                </div>
                <div className="text-sm text-gray-500">{selected.id}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openBrokerDialog(selected);
                  }}
                >
                  Edit
                </Button>
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
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Phone', selected.phone ?? '—'],
                ['Email', selected.email ?? '—'],
                ['License', selected.license_no ?? '—'],
                ['Created', formatDisplayDateTime(selected.created_at)],
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
