'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search } from 'lucide-react';

import { CustomerProfileFields } from '@/app/crm/customers/customer-form-ui';
import { CustomerListTable } from '@/app/crm/customers/customer-list-table';
import {
  customerCreatePayload,
  customerCreateSchema,
  EMPTY_CUSTOMER_CREATE,
  type CustomerCreateFormValues
} from '@/lib/customer/customer-forms.schema';

const CUSTOMER_SELECT =
  'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address,created_at';

const LIST_PAGE_SIZE = 40;

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextOffset, setListNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const createForm = useForm<CustomerCreateFormValues>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: EMPTY_CUSTOMER_CREATE,
    mode: 'onChange'
  });

  const fetchCustomerList = useCallback(
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
        const res = await fetch(`/api/crm/customers?${params.toString()}`);
        const body = (await res.json()) as {
          error?: string;
          items?: CustomerRow[];
          hasMore?: boolean;
          nextOffset?: number;
          total?: number | null;
        };
        if (!res.ok) throw new Error(body.error || 'Failed to load customers');
        const rows = body.items ?? [];
        setCustomers((prev) => (opts.reset ? rows : [...prev, ...rows]));
        setListHasMore(Boolean(body.hasMore));
        setListNextOffset(body.nextOffset ?? offset + rows.length);
        if (opts.reset && body.total != null) setListTotal(body.total);
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Failed to load customers');
        if (opts.reset) {
          setCustomers([]);
          setListTotal(null);
        }
      } finally {
        if (opts.reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [listHasMore, listNextOffset, loadingMore, searchQuery]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchCustomerList({ reset: true });
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = loadMoreSentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void fetchCustomerList({ reset: false });
        }
      },
      { rootMargin: '120px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchCustomerList]);

  async function createCustomer(values: CustomerCreateFormValues) {
    setSaving(true);
    try {
      const { data, error: insErr } = await supabase
        .from('customers')
        .insert(customerCreatePayload(values))
        .select(CUSTOMER_SELECT)
        .single();

      if (insErr) throw insErr;
      const row = data as CustomerRow;
      setCustomers((cs) => [row, ...cs]);
      setListTotal((t) => (t != null ? t + 1 : t));
      createForm.reset(EMPTY_CUSTOMER_CREATE);
      setCreateFormOpen(false);
      router.push(`/crm/customers/${row.id}`);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  const listShownCount = listTotal ?? customers.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Card 1 — Create customer (collapsible) */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition-colors hover:bg-ds-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary-500/40 -m-1 p-1"
            onClick={() => setCreateFormOpen((o) => !o)}
            aria-expanded={createFormOpen}
            aria-controls="create-customer-form"
          >
            <ChevronDown
              className={`mt-0.5 size-4 shrink-0 text-ds-gray-500 transition-transform${createFormOpen ? ' rotate-180' : ''}`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ds-gray-900">
                Add customer
              </div>
              <div className="text-xs text-ds-gray-500">
                Create a new customer record — fill in name, phone and optional
                contact details.
              </div>
            </div>
          </button>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => void fetchCustomerList({ reset: true })}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {createFormOpen ? (
          <form
            id="create-customer-form"
            onSubmit={createForm.handleSubmit(
              async (values) => createCustomer(values),
              () => pageError('Fix the highlighted fields before saving.')
            )}
            className="mt-4 flex flex-col gap-4"
          >
            <CustomerProfileFields control={createForm.control} />
            <div className="flex justify-end gap-2 border-t border-ds-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateFormOpen(false);
                  createForm.reset(EMPTY_CUSTOMER_CREATE);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save customer'}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      {/* Card 2 — Customer list table */}
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ds-gray-900">
              Customers
            </div>
            <div className="text-xs text-ds-gray-500">
              {loading
                ? 'Loading…'
                : searchQuery
                  ? `${customers.length} of ${listShownCount} shown`
                  : `${listShownCount} shown`}
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

        <CustomerListTable
          rows={customers}
          loading={loading}
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
