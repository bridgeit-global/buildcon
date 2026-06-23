'use client';

import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { InquiryListTable } from '../inquiry-list-table';
import { useInquiryListResources } from '../use-inquiry-list-resources';
import BackButton from '@/components/buttons/back-button';

export default function InquiryListPage() {
  const {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    navigateToBookingFromInquiry
  } = useInquiryListResources();

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
        <InquiryListTable
          inquiries={inquiries}
          loadingInquiries={loadingInquiries}
          loadInquiries={loadInquiries}
          units={units}
          navigateToBookingFromInquiry={navigateToBookingFromInquiry}
        />
      </Suspense>
    </div>
  );
}
