import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';

export function bookingGeneratedFileStem(opts: {
  kind: BookingDocumentPrintKind;
  linkId?: string | null;
  fileId: string;
}): string {
  const linkId = opts.linkId?.trim();
  return linkId
    ? `${opts.kind}--${linkId}--${opts.fileId}`
    : `${opts.kind}-${opts.fileId}`;
}

export function bookingGeneratedStoragePath(opts: {
  projectId: string;
  bookingId: string;
  kind: BookingDocumentPrintKind;
  linkId?: string | null;
  fileId: string;
  extension?: 'pdf' | 'html';
}): string {
  const ext = opts.extension ?? 'pdf';
  const stem = bookingGeneratedFileStem(opts);
  return `documents/project/${opts.projectId}/booking-generated/${opts.bookingId}/${stem}.${ext}`;
}
