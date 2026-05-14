'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InquiryListTable } from '../inquiry-list-table';
import { useInquiryListResources } from '../use-inquiry-list-resources';

export default function InquiryListPage() {
  const {
    activeProjectId,
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    error,
    navigateToBookingFromInquiry
  } = useInquiryListResources();

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to view the inquiry list.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 px-2" asChild>
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

      <InquiryListTable
        inquiries={inquiries}
        loadingInquiries={loadingInquiries}
        loadInquiries={loadInquiries}
        units={units}
        navigateToBookingFromInquiry={navigateToBookingFromInquiry}
      />
    </div>
  );
}
