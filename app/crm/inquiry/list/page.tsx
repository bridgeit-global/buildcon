'use client';

import { Suspense, useMemo, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import { InquiryListTable } from '../inquiry-list-table';
import { parseInquiryListUrlColumnFilters } from '../inquiry-list-filters';
import { useInquiryListResources } from '../use-inquiry-list-resources';
import BackButton from '@/components/buttons/back-button';

function InquiryListTableWithUrlFilters(
  props: Omit<ComponentProps<typeof InquiryListTable>, 'urlColumnFilters'>
) {
  const searchParams = useSearchParams();
  const urlColumnFilters = useMemo(
    () => parseInquiryListUrlColumnFilters(searchParams),
    [searchParams, searchParams.toString()]
  );

  return <InquiryListTable {...props} urlColumnFilters={urlColumnFilters} />;
}

export default function InquiryListPage() {
  const { sorting, onSortingChange } = useServerListSorting();
  const {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    navigateToBookingFromInquiry
  } = useInquiryListResources(sorting);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <BackButton href="/crm/inquiry" label="Leads overview" />
      </div>
      <Suspense
        fallback={
          <Card className="p-4 text-sm text-muted-foreground">
            Loading inquiry table…
          </Card>
        }
      >
        <InquiryListTableWithUrlFilters
          inquiries={inquiries}
          loadingInquiries={loadingInquiries}
          loadInquiries={loadInquiries}
          units={units}
          navigateToBookingFromInquiry={navigateToBookingFromInquiry}
          sorting={sorting}
          onSortingChange={onSortingChange}
        />
      </Suspense>
    </div>
  );
}
