'use client';

import { useParams } from 'next/navigation';
import { DocumentsPageContent } from '../documents-page-content';

export default function DocumentsForBookingPage() {
  const params = useParams();
  const raw = params.booking_id;
  const bookingId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';

  return <DocumentsPageContent pathBookingId={bookingId} />;
}
