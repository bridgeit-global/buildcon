'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InquiryListTable } from '../inquiry-list-table';
import { useInquiryListResources } from '../use-inquiry-list-resources';

export default function InquiryListPage() {
  const {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    error,
    navigateToBookingFromInquiry
  } = useInquiryListResources();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="gap-1 px-2" asChild>
          <Link href="/crm/inquiry">
            <ArrowLeft className="size-4" />
            Leads overview
          </Link>
        </Button>
      </div>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

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
