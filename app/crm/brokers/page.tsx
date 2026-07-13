'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import type { SortingState } from '@tanstack/react-table';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { sortingStateToQuery } from '@/lib/crm/list-sort';
import {
  brokerFormPayload,
  brokerFormSchema,
  EMPTY_BROKER_FORM,
  type BrokerFormValues
} from '@/lib/broker/broker-forms.schema';
import { Card } from '@/components/ui/card';
import { CrmSkeletonBar } from '../_components/crm-skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { BrokerListTable, type BrokerTableRow } from './broker-list-table';

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_SORTING: SortingState = [{ id: 'created_at', desc: true }];

export default function BrokersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [brokers, setBrokers] = useState<BrokerTableRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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

  const fetchBrokerList = useCallback(async () => {
    setLoading(true);
    try {
      const offset = pageIndex * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset)
      });
      if (searchQuery) params.set('q', searchQuery);
      const sortQuery = sortingStateToQuery(sorting);
      if (sortQuery.sort) params.set('sort', sortQuery.sort);
      if (sortQuery.sortDir) params.set('sortDir', sortQuery.sortDir);

      const res = await fetch(`/api/crm/brokers?${params.toString()}`);
      const body = (await res.json()) as {
        error?: string;
        items?: BrokerTableRow[];
        total?: number | null;
      };
      if (!res.ok) throw new Error(body.error || 'Failed to load brokers');
      setBrokers(body.items ?? []);
      if (body.total != null) setListTotal(body.total);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load brokers');
      setBrokers([]);
      setListTotal(null);
    } finally {
      setLoading(false);
    }
  }, [pageIndex, pageSize, searchQuery, sorting]);

  const listCount = listTotal ?? brokers.length;
  const pageCount = Math.max(1, Math.ceil(listCount / pageSize));
  const canPreviousPage = pageIndex > 0;
  const canNextPage = pageIndex < pageCount - 1;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPageIndex(0);
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchBrokerList();
  }, [fetchBrokerList]);

  useEffect(() => {
    const maxPage = Math.max(0, pageCount - 1);
    if (pageIndex > maxPage) setPageIndex(maxPage);
  }, [pageCount, pageIndex]);

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
        setListTotal((t) => (t != null ? t + 1 : t));
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
            onClick={() => void fetchBrokerList()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {createFormOpen ? (
          <form
            id="create-broker-form"
            onSubmit={(e) => void createBroker(e)}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                <TextInputField
                  label="First name"
                  required
                  placeholder="e.g. Amit"
                  error={errors.first_name?.message}
                  {...register('first_name')}
                />
                <TextInputField
                  label="Middle name"
                  placeholder="Optional"
                  error={errors.middle_name?.message}
                  {...register('middle_name')}
                />
                <TextInputField
                  label="Last name"
                  required
                  placeholder="e.g. Deshmukh"
                  error={errors.last_name?.message}
                  {...register('last_name')}
                />
              </div>
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

      <Card className="p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-ds-gray-900">
            Brokers
          </div>
          <p className="text-xs text-ds-gray-500">
            {loading && brokers.length === 0 ? (
              <CrmSkeletonBar className="inline-block w-16" />
            ) : (
              <>
                {listCount} broker{listCount !== 1 ? 's' : ''}
                {searchQuery.trim() ? ' (filtered)' : ''}
              </>
            )}
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by name, phone…"
            className="max-w-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-ds-gray-500">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 25, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>per page</span>
          </div>
        </div>

        <BrokerListTable
          rows={brokers}
          loading={loading}
          sorting={sorting}
          onSortingChange={(updater) => {
            setSorting(updater);
            setPageIndex(0);
          }}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
          <span className="tabular-nums">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              disabled={!canPreviousPage || loading}
              onClick={() => setPageIndex((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              disabled={!canNextPage || loading}
              onClick={() => setPageIndex((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
