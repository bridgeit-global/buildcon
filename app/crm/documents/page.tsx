'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DocumentsPageContent } from './documents-page-content';

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const legacyBooking = searchParams.get('booking');

  useEffect(() => {
    if (legacyBooking) {
      router.replace(`/crm/documents/${encodeURIComponent(legacyBooking)}`);
    }
  }, [legacyBooking, router]);

  if (legacyBooking) {
    return (
      <div className="rounded-lg border border-ds-gray-200 bg-card p-4 text-sm text-ds-gray-600">
        Opening booking documents…
      </div>
    );
  }

  return <DocumentsPageContent />;
}
