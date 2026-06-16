'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  brokerFormPayload,
  brokerFormSchema,
  EMPTY_BROKER_FORM,
  type BrokerFormValues
} from '@/lib/broker/broker-forms.schema';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TextInputField } from '@/components/ui/text-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { ChevronDown, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { BrokerListTable, type BrokerTableRow } from './broker-list-table';

export default function BrokersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [brokers, setBrokers] = useState<BrokerTableRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [createFormOpen, setCreateFormOpen] = useState(false);
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
      .select('id,full_name,phone,email,license_no,status,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (qErr) pageError(qErr.message);
    setBrokers((data ?? []) as BrokerTableRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBroker = handleSubmit(
    async (values) => {
      setSaving(true);
      try {
        const { data, error: insErr } = await supabase
          .from('brokers')
          .insert(brokerFormPayload(values))
          .select('id,full_name,phone,email,license_no,status,created_at')
          .single();
        if (insErr) throw insErr;
        const row = data as BrokerTableRow;
        setBrokers((list) => [row, ...list]);
        reset(EMPTY_BROKER_FORM);
        setCreateFormOpen(false);
        router.push(`/crm/brokers/${row.id}`);
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Failed to create broker');
      } finally {
        setSaving(false);
      }
    },
    () => pageError('Fix the highlighted fields before saving.')
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Card 1 — Create broker (collapsible) */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg p-1 text-left transition-colors hover:bg-ds-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary-500/40"
            onClick={() => setCreateFormOpen((o) => !o)}
            aria-expanded={createFormOpen}
            aria-controls="create-broker-form"
          >
            <ChevronDown
              className={`mt-0.5 size-4 shrink-0 text-ds-gray-500 transition-transform${createFormOpen ? ' rotate-180' : ''}`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ds-gray-900">
                Add broker
              </div>
              <div className="text-xs text-ds-gray-500">
                Create a new broker record — fill in name, phone and optional
                contact details.
              </div>
            </div>
          </button>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {createFormOpen ? (
          <form
            id="create-broker-form"
            onSubmit={(e) => void createBroker(e)}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInputField
                className="sm:col-span-2"
                label="Full name"
                required
                placeholder="Broker / agency name"
                error={errors.full_name?.message}
                {...register('full_name')}
              />
              <PhoneInputField
                value={watch('phone')}
                onChange={(v) => setValue('phone', v, { shouldValidate: true })}
                error={errors.phone?.message}
              />
              <EmailInputField
                value={watch('email')}
                onChange={(v) => setValue('email', v, { shouldValidate: true })}
                error={errors.email?.message}
              />
              <TextInputField
                className="sm:col-span-2"
                label="RERA / license no."
                {...register('license_no')}
              />
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
              <TextareaField
                className="sm:col-span-2"
                label="Notes"
                rows={3}
                {...register('notes')}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-ds-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateFormOpen(false);
                  reset(EMPTY_BROKER_FORM);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save broker'}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      {/* Card 2 — Broker list table */}
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ds-gray-900">
              Brokers
            </div>
            <div className="text-xs text-ds-gray-500">
              {loading ? 'Loading…' : `${brokers.length} total`}
            </div>
          </div>
          <div className="relative w-full max-w-[260px] sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ds-gray-400" />
            <Input
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone…"
            />
          </div>
        </div>

        <BrokerListTable rows={brokers} loading={loading} globalFilter={search} />
      </Card>
    </div>
  );
}
