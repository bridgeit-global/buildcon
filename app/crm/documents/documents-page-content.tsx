'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { loadBookingPrintPack, type BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { isCustomerKycComplete } from '@/lib/customer/kyc-identifiers';
import { generateAndNotifyBookingDocument } from '@/lib/booking/generate-and-notify-booking-document';
import { formatDocumentDeliveryNotice } from '@/lib/booking/notify-booking-document';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { GENERATED_DOCUMENTS_LIST_SELECT } from '@/lib/crm/generated-documents-select';
import {
  GeneratedDocumentsTable,
  type GeneratedDocRow
} from './generated-documents-table';
import { DocumentsBookingListTable } from './documents-booking-list-table';
import { BookingDocumentsMatrixTable, buildMatrixRows } from './booking-documents-matrix-table';

type BookingPickRow = {
  id: string;
  workflow_stage: string;
  projects: { name: string } | { name: string }[] | null;
  customers:
    | { full_name: string }
    | { full_name: string }[]
    | null;
  units:
    | { unit_code: string }
    | { unit_code: string }[]
    | null;
};

function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export type DocumentsPageContentProps = {
  /** When set (from `/crm/documents/[booking_id]`), tools target this booking only. */
  pathBookingId?: string;
};

export function DocumentsPageContent({ pathBookingId }: DocumentsPageContentProps) {
  const lockedBookingId = pathBookingId?.trim() ? pathBookingId.trim() : '';

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  const [generated, setGenerated] = useState<GeneratedDocRow[]>([]);
  const [loadingGenerated, setLoadingGenerated] = useState(false);
  const [error, setError] = useState('');

  const [bookingRows, setBookingRows] = useState<BookingPickRow[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [printPack, setPrintPack] = useState<BookingPrintPack | null>(null);
  const [loadingPack, setLoadingPack] = useState(false);
  const [generatingKind, setGeneratingKind] = useState<BookingDocumentPrintKind | null>(null);
  const [deliveryBanner, setDeliveryBanner] = useState('');

  useEffect(() => {
    if (lockedBookingId) {
      setSelectedBookingId(lockedBookingId);
    } else {
      setSelectedBookingId('');
    }
  }, [lockedBookingId]);

  const loadConfirmedBookings = useCallback(async () => {
    if (projectIds.length === 0) {
      setBookingRows([]);
      return;
    }
    setLoadingBookings(true);
    setError('');
    const { data, error: bErr } = await supabase
      .from('bookings')
      .select('id,workflow_stage,customers(full_name),units(unit_code),projects(name)')
      .in('project_id', projectIds)
      .eq('workflow_stage', 'confirmation')
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (bErr) setError(bErr.message);
    setBookingRows((data ?? []) as BookingPickRow[]);
    setLoadingBookings(false);
  }, [projectIds, supabase]);

  useEffect(() => {
    if (lockedBookingId) return;
    void loadConfirmedBookings();
  }, [loadConfirmedBookings, lockedBookingId]);

  const loadGeneratedForBooking = useCallback(
    async (bookingId: string) => {
      if (!bookingId) {
        setGenerated([]);
        return;
      }
      setLoadingGenerated(true);
      setError('');
      const { data, error: gErr } = await supabase
        .from('generated_documents')
        .select(GENERATED_DOCUMENTS_LIST_SELECT)
        .eq('booking_id', bookingId)
        .order('generated_at', { ascending: false })
        .limit(200);
      if (gErr) setError(gErr.message);
      setGenerated((data ?? []) as GeneratedDocRow[]);
      setLoadingGenerated(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (!lockedBookingId) {
      setGenerated([]);
      return;
    }
    void loadGeneratedForBooking(lockedBookingId);
  }, [lockedBookingId, loadGeneratedForBooking]);

  const loadPrintPack = useCallback(async () => {
    if (!selectedBookingId) {
      setPrintPack(null);
      return;
    }
    setLoadingPack(true);
    setError('');
    const res = await loadBookingPrintPack(supabase, selectedBookingId);
    if (!res.ok) {
      setError(res.error);
      setPrintPack(null);
    } else {
      setPrintPack(res.pack);
    }
    setLoadingPack(false);
  }, [selectedBookingId, supabase]);

  useEffect(() => {
    void loadPrintPack();
  }, [loadPrintPack]);

  const refreshGenerated = useCallback(async () => {
    const id = lockedBookingId || selectedBookingId;
    if (id) await loadGeneratedForBooking(id);
  }, [lockedBookingId, selectedBookingId, loadGeneratedForBooking]);

  const handleMatrixGenerate = useCallback(
    async (kind: BookingDocumentPrintKind) => {
      if (!printPack) return;
      setGeneratingKind(kind);
      setError('');
      setDeliveryBanner('');
      try {
        const r = await generateAndNotifyBookingDocument({
          supabase,
          bookingId: printPack.booking.id,
          pack: printPack,
          kind
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setDeliveryBanner(
          formatDocumentDeliveryNotice('Document generated and saved.', r.notify)
        );
        await refreshGenerated();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generate failed');
      } finally {
        setGeneratingKind(null);
      }
    },
    [printPack, supabase, refreshGenerated]
  );

  const matrixRows = useMemo(() => buildMatrixRows(generated), [generated]);

  const unit = printPack ? unwrapJoin(printPack.booking.units) : null;
  const customer = printPack ? unwrapJoin(printPack.booking.customers) : null;
  const buyersNeedingKyc = printPack
    ? printPack.buyerKyc.filter(
        (b) =>
          !isCustomerKycComplete(b.pan, b.aadhaarLast4, [
            ...(b.hasPanDoc ? ['pan'] : []),
            ...(b.hasAadhaarDoc ? ['aadhaar'] : [])
          ])
      )
    : [];

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-lg border border-ds-error-200 bg-ds-error-50 px-3 py-2 text-sm text-ds-error-800">
          {error}
        </div>
      ) : null}

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold text-ds-gray-900">
            {lockedBookingId ? 'Booking documents' : 'Confirmed bookings'}
          </h2>
          <p className="mt-1 text-sm text-ds-gray-600">
            {lockedBookingId ? (
              <>
                Generate documents from the table below; each version is stored and can be
                downloaded. Configure email in environment variables to notify the buyer
                automatically.{' '}
                <Link
                  className="font-medium text-ds-primary-600 underline-offset-2 hover:underline"
                  href="/crm/documents"
                >
                  Back to list
                </Link>
                {' · '}
                <Link
                  className="font-medium text-ds-primary-600 underline-offset-2 hover:underline"
                  href={`/crm/bookings/${encodeURIComponent(lockedBookingId)}`}
                >
                  Open booking
                </Link>
              </>
            ) : (
              <>
                Bookings in <span className="font-medium">Booking confirmation</span> across your
                projects. Click a row to open documents for that unit.
              </>
            )}
          </p>
        </div>

        {lockedBookingId ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/crm/documents">All confirmed bookings</Link>
            </Button>
          </div>
        ) : null}

        {!lockedBookingId ? (
          <DocumentsBookingListTable
            rows={bookingRows}
            loading={loadingBookings}
            selectedBookingId={selectedBookingId}
          />
        ) : null}

        {lockedBookingId ? (
          <>
            {loadingPack ? (
              <p className="text-sm text-ds-gray-500">Loading booking details…</p>
            ) : printPack ? (
              <>
                <div className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
                    Booked unit
                  </div>
                  {unit ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-ds-gray-200 text-xs text-ds-gray-500">
                            <th className="py-2 pr-3 font-medium">Unit</th>
                            <th className="py-2 pr-3 font-medium">Wing</th>
                            <th className="py-2 pr-3 font-medium">Floor</th>
                            <th className="py-2 pr-3 font-medium">Type</th>
                            <th className="py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="text-ds-gray-800">
                            <td className="py-2 pr-3 font-semibold tabular-nums">
                              {unit.unit_code}
                            </td>
                            <td className="py-2 pr-3">{unit.wing_name ?? '—'}</td>
                            <td className="py-2 pr-3 tabular-nums">{unit.floor ?? '—'}</td>
                            <td className="py-2 pr-3">{unit.unit_type ?? '—'}</td>
                            <td className="py-2">{unit.status ?? '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ds-gray-600">No unit on this booking.</p>
                  )}
                  <p className="mt-2 text-xs text-ds-gray-500">
                    Buyer: {customer?.full_name ?? '—'} · Workflow:{' '}
                    {printPack.booking.workflow_stage}
                  </p>
                </div>

                {!printPack.kycComplete ? (
                  <div className="rounded-lg border border-ds-warning-200 bg-ds-warning-50/60 p-3 text-sm text-ds-warning-900">
                    <p className="font-medium">KYC incomplete</p>
                    <p className="mt-1 text-ds-warning-800">
                      Complete PAN, Aadhaar last four, and PAN/Aadhaar uploads for every applicant
                      before generating the application form.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {buyersNeedingKyc.map((b) => (
                        <Button
                          key={b.customerId}
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link
                            href={`/crm/customers?customer=${encodeURIComponent(b.customerId)}&tab=kyc`}
                          >
                            KYC — {b.label}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {deliveryBanner ? (
                  <div className="rounded-lg border border-ds-primary-200 bg-ds-primary-50/70 px-3 py-2 text-sm text-ds-primary-900">
                    {deliveryBanner}
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
                    Documents
                  </p>
                  <BookingDocumentsMatrixTable
                    rows={matrixRows}
                    kycComplete={printPack.kycComplete}
                    generatingKind={generatingKind}
                    onGenerate={handleMatrixGenerate}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-ds-gray-500">Could not load this booking.</p>
            )}

            <div className="border-t border-ds-gray-200 pt-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-ds-gray-900">History</div>
                <div className="text-xs text-ds-gray-500">
                  All generated rows for this booking (newest first), including every payment
                  receipt and demand letter. Older print-only audit rows may appear without a
                  download.
                </div>
              </div>
              <GeneratedDocumentsTable
                rows={generated}
                loading={loadingGenerated}
                variant="bookingFocus"
                showDownload
                onRefresh={() => void loadGeneratedForBooking(lockedBookingId)}
              />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
