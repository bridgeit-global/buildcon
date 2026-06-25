'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronDown, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { BrokerListTable, type BrokerTableRow } from './broker-list-table';

const LIST_PAGE_SIZE = 40;

const DEFAULT_SORTING: SortingState = [{ id: 'created_at', desc: true }];

export default function BrokersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [brokers, setBrokers] = useState<BrokerTableRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextOffset, setListNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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

  const fetchBrokerList = useCallback(
    async (opts: { reset: boolean }) => {
      const offset = opts.reset ? 0 : listNextOffset;
      if (opts.reset) {
        setLoading(true);
        setListHasMore(false);
        setListNextOffset(0);
      } else {
        if (!listHasMore || loadingMore) return;
        setLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          limit: String(LIST_PAGE_SIZE),
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
          hasMore?: boolean;
          nextOffset?: number;
          total?: number | null;
        };
        if (!res.ok) throw new Error(body.error || 'Failed to load brokers');
        const rows = body.items ?? [];
        setBrokers((prev) => (opts.reset ? rows : [...prev, ...rows]));
        setListHasMore(Boolean(body.hasMore));
        setListNextOffset(body.nextOffset ?? offset + rows.length);
        if (opts.reset && body.total != null) setListTotal(body.total);
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Failed to load brokers');
        if (opts.reset) {
          setBrokers([]);
          setListTotal(null);
        }
      } finally {
        if (opts.reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [listHasMore, listNextOffset, loadingMore, searchQuery, sorting]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchBrokerList({ reset: true });
  }, [searchQuery, sorting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = loadMoreSentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void fetchBrokerList({ reset: false });
        }
      },
      { rootMargin: '120px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchBrokerList]);

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

  const listShownCount = listTotal ?? brokers.length;

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
            onClick={() => void fetchBrokerList({ reset: true })}
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

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ds-gray-900">
              Brokers
            </div>
            <div className="text-xs text-ds-gray-500">
              {loading && brokers.length === 0 ? (
                <CrmSkeletonBar className="w-20" />
              ) : searchQuery ? (
                `${brokers.length} of ${listShownCount} shown`
              ) : (
                `${listShownCount} shown`
              )}
            </div>
          </div>
          <div className="relative w-full max-w-[260px] sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ds-gray-400" />
            <Input
              className="pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, phone…"
            />
          </div>
        </div>

        <BrokerListTable
          rows={brokers}
          loading={loading}
          sorting={sorting}
          onSortingChange={setSorting}
        />

        <div ref={loadMoreSentinelRef} className="h-1" aria-hidden />
        {loadingMore ? (
          <div className="py-3 text-center text-xs text-ds-gray-500">
            Loading more…
          </div>
        ) : null}
      </Card>
    </div>
  );
}
