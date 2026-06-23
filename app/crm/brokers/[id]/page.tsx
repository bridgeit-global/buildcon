'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { pageError } from '@/lib/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TextInputField } from '@/components/ui/text-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  brokerFormPayload,
  brokerFormSchema,
  EMPTY_BROKER_FORM,
  type BrokerFormValues
} from '@/lib/broker/broker-forms.schema';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import BackButton from '@/components/buttons/back-button';

const BROKER_SELECT =
  'id,full_name,phone,email,license_no,status,notes,created_at';

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

function rowToFormValues(b: BrokerRow): BrokerFormValues {
  return {
    full_name: b.full_name,
    phone: b.phone ?? '',
    email: b.email ?? '',
    license_no: b.license_no ?? '',
    status: b.status === 'Inactive' ? 'Inactive' : 'Active',
    notes: b.notes ?? ''
  };
}

export default function BrokerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [broker, setBroker] = useState<BrokerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
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

  useEffect(() => {
    async function fetchBroker() {
      setLoading(true);
      const { data, error } = await supabase
        .from('brokers')
        .select(BROKER_SELECT)
        .eq('id', id)
        .single();
      if (error) {
        pageError(error.message);
        setLoading(false);
        return;
      }
      const row = data as BrokerRow;
      setBroker(row);
      setLoading(false);
    }
    void fetchBroker();
  }, [id, supabase]);

  const saveBroker = handleSubmit(
    async (values) => {
      setSaving(true);
      try {
        const { data, error: updErr } = await supabase
          .from('brokers')
          .update(brokerFormPayload(values))
          .eq('id', id)
          .select(BROKER_SELECT)
          .single();
        if (updErr) throw updErr;
        const row = data as BrokerRow;
        setBroker(row);
        setEditOpen(false);
        reset(rowToFormValues(row));
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Failed to save broker');
      } finally {
        setSaving(false);
      }
    },
    () => pageError('Fix the highlighted fields before saving.')
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BackButton href="/crm/brokers" label="Brokers" />
        </div>
        <Card className="p-6">
          <div className="py-12 text-center text-sm text-ds-gray-500">
            Loading…
          </div>
        </Card>
      </div>
    );
  }

  if (!broker) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BackButton href="/crm/brokers" label="Brokers" />
        </div>
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Briefcase className="size-10 text-ds-gray-300" />
            <div className="text-sm text-ds-gray-500">Broker not found.</div>
            <BackButton href="/crm/brokers" label="Back to brokers" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <BackButton href="/crm/brokers" label="Brokers" />
      </div>

      {/* Details card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-ds-gray-900">
              {broker.full_name}
            </div>
            <div className="text-sm text-ds-gray-500">
              {broker.phone ?? broker.email ?? '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                broker.status === 'Active'
                  ? 'border border-ds-success-200 bg-ds-success-50 text-ds-success-800'
                  : 'border border-ds-gray-200 bg-ds-gray-100 text-ds-gray-600'
              }`}
            >
              {broker.status}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                reset(rowToFormValues(broker));
                setEditOpen((o) => !o);
              }}
            >
              {editOpen ? 'Cancel edit' : 'Edit'}
            </Button>
          </div>
        </div>

        {/* Details grid */}
        {!editOpen ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {(
              [
                ['Phone', broker.phone ?? '—'],
                ['Email', broker.email ?? '—'],
                ['RERA / License', broker.license_no ?? '—'],
                ['Added', formatDisplayDateTime(broker.created_at)],
                ['Notes', broker.notes?.trim() ? broker.notes : '—']
              ] satisfies [string, string][]
            ).map(([k, v]) => (
              <div
                key={k}
                className={`rounded-lg border border-ds-gray-200 bg-white p-3 ${
                  k === 'Notes' ? 'col-span-2 sm:col-span-3' : ''
                }`}
              >
                <div className="text-xs text-ds-gray-500">{k}</div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm font-semibold text-ds-gray-900">
                  {v}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Edit form */
          <form
            onSubmit={(e) => void saveBroker(e)}
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
                  setEditOpen(false);
                  reset(rowToFormValues(broker));
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}

        <p className="mt-4 rounded-lg border border-dashed border-ds-gray-200 bg-ds-gray-50 p-3 text-xs text-ds-gray-600">
          Link brokers to inquiries by choosing <strong>Broker</strong> as lead
          source on the Inquiry form, then pick this broker.
        </p>
      </Card>
    </div>
  );
}
