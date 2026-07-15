'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import type { SortingState } from '@tanstack/react-table';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { sortingStateToQuery } from '@/lib/crm/list-sort';
import { Card } from '@/components/ui/card';
import { CrmSkeletonBar } from '../_components/crm-skeletons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { CustomerProfileFields } from '@/app/crm/customers/customer-form-ui';
import { CustomerListTable } from '@/app/crm/customers/customer-list-table';
import {
  customerCreateAddressesPayload,
  customerCreatePayload,
  customerCreateSchema,
  EMPTY_CUSTOMER_CREATE,
  type CustomerCreateFormValues
} from '@/lib/customer/customer-forms.schema';

const CUSTOMER_SELECT =
  'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address,created_at';

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_SORTING: SortingState = [{ id: 'created_at', desc: true }];

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export default function CustomersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const createForm = useForm<CustomerCreateFormValues>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: EMPTY_CUSTOMER_CREATE,
    mode: 'onChange'
  });

  const fetchCustomerList = useCallback(async () => {
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
      const res = await fetch(`/api/crm/customers?${params.toString()}`);
      const body = (await res.json()) as {
        error?: string;
        items?: CustomerRow[];
        total?: number | null;
      };
      if (!res.ok) throw new Error(body.error || 'Failed to load customers');
      setCustomers(body.items ?? []);
      if (body.total != null) setListTotal(body.total);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load customers');
      setCustomers([]);
      setListTotal(null);
    } finally {
      setLoading(false);
    }
  }, [pageIndex, pageSize, searchQuery, sorting]);

  const listCount = listTotal ?? customers.length;
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
    void fetchCustomerList();
  }, [fetchCustomerList]);

  useEffect(() => {
    const maxPage = Math.max(0, pageCount - 1);
    if (pageIndex > maxPage) setPageIndex(maxPage);
  }, [pageCount, pageIndex]);

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

      const { correspondence, permanent } =
        customerCreateAddressesPayload(values);
      const { error: addrErr } = await supabase.from('customer_addresses').insert([
        { customer_id: row.id, kind: 'current', ...correspondence },
        { customer_id: row.id, kind: 'permanent', ...permanent }
      ]);
      if (addrErr) throw addrErr;

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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ds-gray-900">Customers</div>
          <div className="text-xs text-ds-gray-500">
            Search and manage customer records, or add a new customer.
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => void fetchCustomerList()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button onClick={() => setCreateFormOpen(true)}>Add customer</Button>
        </div>
      </Card>

      <FormDrawer
        open={createFormOpen}
        onOpenChange={(open) => {
          setCreateFormOpen(open);
          if (!open) createForm.reset(EMPTY_CUSTOMER_CREATE);
        }}
        title="Add customer"
        description="Create a new customer record with contact details and address."
        size="lg"
        footer={
          <FormActions
            formId="create-customer-form"
            onCancel={() => {
              setCreateFormOpen(false);
              createForm.reset(EMPTY_CUSTOMER_CREATE);
            }}
            submitLabel="Save customer"
            saving={saving}
          />
        }
      >
        <form
          id="create-customer-form"
          onSubmit={createForm.handleSubmit(
            async (values) => createCustomer(values),
            () => pageError('Fix the highlighted fields before saving.')
          )}
          className="space-y-6"
        >
          <CustomerProfileFields control={createForm.control} showAddress />
        </form>
      </FormDrawer>

      {/* Card 2 — Customer list table */}
      <Card className="p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground">
            Customers
          </div>
          <div className="text-xs text-muted-foreground">
            {loading && customers.length === 0 ? (
              <CrmSkeletonBar className="inline-block w-16" />
            ) : (
              <>
                {listCount} customer{listCount !== 1 ? 's' : ''}
                {searchQuery.trim() ? ' (filtered)' : ''}
              </>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by name, phone…"
            className="max-w-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

        <CustomerListTable
          rows={customers}
          loading={loading}
          sorting={sorting}
          onSortingChange={(updater) => {
            setSorting(updater);
            setPageIndex(0);
          }}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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
