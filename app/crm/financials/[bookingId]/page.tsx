'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import { sortRowsByState } from '@/lib/crm/list-sort';
import { useCrmProjectsStore } from '@/store/crm-projects-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInr, formatInrCompactLacCr } from '../../inr-format';
import { CrmDetailPageSkeleton } from '../../_components/crm-skeletons';
import { PaymentScheduleTable } from '../payment-schedule-table';
import {
  BookingLedgerTable,
  buildBookingLedgerRows
} from '../booking-ledger-table';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import {
  notifyGeneratedBookingDocument,
  toastDocumentDeliveryResults
} from '@/lib/booking/notify-booking-document';
import { parseKindFromBookingGeneratedPath, parseLinkIdFromBookingGeneratedPath } from '@/lib/booking/booking-generated-doc-kind';
import { GENERATED_DOCUMENTS_LIST_SELECT } from '@/lib/crm/generated-documents-select';
import { PdfViewerDialog } from '@/components/pdf-viewer-dialog';
import { CollectionManageDialog } from '../collection-manage-dialog';
import { CreateMilestoneDialog } from '../create-milestone-dialog';
import {
  EditMilestoneDialog,
  type EditMilestoneSchedule
} from '../edit-milestone-dialog';
import {
  DeleteMilestoneDialog,
  type DeleteMilestoneSchedule
} from '../delete-milestone-dialog';
import { persistCollectionReceipt } from '@/lib/booking/persist-collection-receipt';
import BackButton from '@/components/buttons/back-button';

type ScheduleRow = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

type CollectionRow = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
  created_at: string | null;
};

type GeneratedDocPickRow = {
  id: string;
  booking_id: string | null;
  template_id: string | null;
  storage_path: string;
  generated_at: string;
};

export default function FinancialsBookingPage() {
  const params = useParams();
  const bookingId = String(params.bookingId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const projects = useCrmProjectsStore((s) => s.projects);
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [unitCode, setUnitCode] = useState('—');
  const [customerName, setCustomerName] = useState('—');
  const [projectId, setProjectId] = useState('');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingDemandFor, setGeneratingDemandFor] = useState<string | null>(null);
  const [demandPreviewBusyId, setDemandPreviewBusyId] = useState<string | null>(null);
  const [demandSendBusyId, setDemandSendBusyId] = useState<string | null>(null);
  const [generatingReceiptFor, setGeneratingReceiptFor] = useState<string | null>(null);
  const [receiptPreviewBusyId, setReceiptPreviewBusyId] = useState<string | null>(null);
  const [receiptSendBusyId, setReceiptSendBusyId] = useState<string | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocPickRow[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('Demand letter');
  const [viewerSendDoc, setViewerSendDoc] = useState<{
    kind: 'demand-letter' | 'receipt';
    doc: GeneratedDocPickRow;
  } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDefaultScheduleId, setManageDefaultScheduleId] = useState<string | null>(
    null
  );
  const [manageDefaultAmount, setManageDefaultAmount] = useState<number | null>(null);
  const [createMilestoneOpen, setCreateMilestoneOpen] = useState(false);
  const [editMilestoneSchedule, setEditMilestoneSchedule] =
    useState<EditMilestoneSchedule | null>(null);
  const [deleteMilestoneSchedule, setDeleteMilestoneSchedule] =
    useState<DeleteMilestoneSchedule | null>(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  async function loadFinancials() {
    if (!bookingId) return;
    setLoading(true);
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id,project_id,unit_id,customer_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !booking) {
      pageError(bErr?.message ?? 'Booking not found');
      setLoading(false);
      return;
    }

    setProjectId(booking.project_id as string);

    const [{ data: unit }, { data: customer }, schedRes, collRes, genRes] =
      await Promise.all([
        supabase
          .from('units')
          .select('unit_code')
          .eq('id', booking.unit_id)
          .maybeSingle(),
        supabase
          .from('customers')
          .select('full_name')
          .eq('id', booking.customer_id)
          .maybeSingle(),
        supabase
          .from('payment_schedules')
          .select('id,instalment_no,milestone,due_date,amount')
          .eq('booking_id', bookingId)
          .order('instalment_no', { ascending: true }),
        supabase
          .from('collections')
          .select('id,schedule_id,received_amount,received_at,mode,reference,created_at')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false }),
        supabase
          .from('generated_documents')
          .select(GENERATED_DOCUMENTS_LIST_SELECT)
          .eq('booking_id', bookingId)
          .order('generated_at', { ascending: false })
          .limit(200)
      ]);

    setUnitCode((unit?.unit_code as string) ?? '—');
    setCustomerName((customer?.full_name as string) ?? '—');

    if (schedRes.error) pageError(schedRes.error.message);
    if (collRes.error) pageError(collRes.error.message);
    setSchedules((schedRes.data ?? []) as ScheduleRow[]);
    setCollections((collRes.data ?? []) as CollectionRow[]);
    if (genRes?.error) pageError(genRes.error.message);
    setGeneratedDocs((genRes.data ?? []) as GeneratedDocPickRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadFinancials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const receivedBySchedule = useMemo(
    () =>
      collections.reduce<Record<string, number>>((acc, c) => {
        if (c.schedule_id) {
          acc[c.schedule_id] = (acc[c.schedule_id] || 0) + c.received_amount;
        }
        return acc;
      }, {}),
    [collections]
  );

  const receiptsBySchedule = useMemo(() => {
    return collections.reduce<Record<string, CollectionRow[]>>((acc, c) => {
      if (!c.schedule_id) return acc;
      const sid = c.schedule_id;
      (acc[sid] ||= []).push(c);
      return acc;
    }, {});
  }, [collections]);

  const latestDemandDocByScheduleId = useMemo(() => {
    const m = new Map<string, GeneratedDocPickRow>();
    for (const d of generatedDocs) {
      const kind = parseKindFromBookingGeneratedPath(d.storage_path);
      if (kind !== 'demand-letter') continue;
      const sid = parseLinkIdFromBookingGeneratedPath(d.storage_path);
      if (!sid) continue;
      const existing = m.get(sid);
      if (!existing || String(d.generated_at) > String(existing.generated_at)) {
        m.set(sid, d);
      }
    }
    return m;
  }, [generatedDocs]);

  const receiptDocByCollectionId = useMemo(() => {
    const m = new Map<string, GeneratedDocPickRow>();
    for (const d of generatedDocs) {
      const kind = parseKindFromBookingGeneratedPath(d.storage_path);
      if (kind !== 'receipt') continue;
      const cid = parseLinkIdFromBookingGeneratedPath(d.storage_path);
      if (!cid) continue;
      const existing = m.get(cid);
      if (!existing || String(d.generated_at) > String(existing.generated_at)) {
        m.set(cid, d);
      }
    }
    return m;
  }, [generatedDocs]);

  const latestCollectionByScheduleId = useMemo(() => {
    const m = new Map<string, CollectionRow>();
    for (const c of collections) {
      if (!c.schedule_id) continue;
      const key = c.schedule_id;
      const existing = m.get(key);
      if (!existing) {
        m.set(key, c);
        continue;
      }
      const a = existing.received_at || existing.created_at || '';
      const b = c.received_at || c.created_at || '';
      if (b > a) m.set(key, c);
    }
    return m;
  }, [collections]);

  const latestReceiptDocByScheduleId = useMemo(() => {
    const m = new Map<string, GeneratedDocPickRow>();
    for (const [scheduleId, c] of latestCollectionByScheduleId.entries()) {
      const doc = receiptDocByCollectionId.get(c.id);
      if (doc) m.set(scheduleId, doc);
    }
    return m;
  }, [latestCollectionByScheduleId, receiptDocByCollectionId]);

  async function previewDemandDoc(doc: GeneratedDocPickRow) {
    const bucket = doc.storage_path.startsWith('documents/') ? 'documents' : null;
    if (!bucket) {
      pageError('This demand row has no stored PDF yet.');
      return;
    }
    setDemandPreviewBusyId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.storage_path, 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('No preview URL');
      setViewerTitle('Demand letter');
      setViewerUrl(data.signedUrl);
      setViewerSendDoc({ kind: 'demand-letter', doc });
      setViewerOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setDemandPreviewBusyId(null);
    }
  }

  async function previewReceiptDoc(doc: GeneratedDocPickRow) {
    const bucket = doc.storage_path.startsWith('documents/') ? 'documents' : null;
    if (!bucket) {
      pageError('This receipt row has no stored PDF yet.');
      return;
    }
    setReceiptPreviewBusyId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.storage_path, 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('No preview URL');
      setViewerTitle('Payment receipt');
      setViewerUrl(data.signedUrl);
      setViewerSendDoc({ kind: 'receipt', doc });
      setViewerOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setReceiptPreviewBusyId(null);
    }
  }

  async function sendDemandDoc(doc: GeneratedDocPickRow) {
    setDemandSendBusyId(doc.id);
    try {
      const notify = await notifyGeneratedBookingDocument(bookingId, doc.id);
      if (!notify.ok) {
        pageError(typeof notify.error === 'string' ? notify.error : 'Send failed');
        return;
      }
      toastDocumentDeliveryResults(notify, { lead: 'Demand letter sent.' });
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setDemandSendBusyId(null);
    }
  }

  async function sendReceiptDoc(doc: GeneratedDocPickRow) {
    setReceiptSendBusyId(doc.id);
    try {
      const notify = await notifyGeneratedBookingDocument(bookingId, doc.id);
      if (!notify.ok) {
        pageError(typeof notify.error === 'string' ? notify.error : 'Send failed');
        return;
      }
      toastDocumentDeliveryResults(notify, { lead: 'Payment receipt sent.' });
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setReceiptSendBusyId(null);
    }
  }

  const breakableSchedules = useMemo(() => {
    return schedules
      .map((s) => {
        const received = receivedBySchedule[s.id] || 0;
        const balance = Math.max(0, (s.amount || 0) - received);
        return { id: s.id, instalment_no: s.instalment_no, milestone: s.milestone, balance };
      })
      .filter((s) => s.balance > 0);
  }, [schedules, receivedBySchedule]);

  const pendingSchedules = useMemo(
    () =>
      schedules
        .map((s) => {
          const received = receivedBySchedule[s.id] || 0;
          const pending = Math.max(0, (s.amount || 0) - received);
          return { ...s, pending };
        })
        .filter((s) => s.pending > 0),
    [schedules, receivedBySchedule]
  );

  const totalAmount = schedules.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = collections.reduce(
    (s, r) => s + (r.received_amount || 0),
    0
  );
  const totalBalance = totalAmount - totalReceived;

  const nextInstalmentNo = useMemo(() => {
    const maxNo = schedules.reduce((m, s) => Math.max(m, s.instalment_no || 0), 0);
    return maxNo + 1;
  }, [schedules]);

  const scheduleLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of schedules) {
      m.set(s.id, `${s.instalment_no}. ${s.milestone}`);
    }
    return m;
  }, [schedules]);

  const ledgerRows = useMemo(
    () => buildBookingLedgerRows(schedules, collections, scheduleLabelById),
    [schedules, collections, scheduleLabelById]
  );
  const { sorting: ledgerSorting, onSortingChange: onLedgerSortingChange } =
    useServerListSorting([{ id: 'date', desc: false }]);
  const sortedLedgerRows = useMemo(
    () =>
      sortRowsByState(ledgerRows, ledgerSorting, (row, colId) => {
        if (colId === 'date') return row.sortDate;
        if (colId === 'type') return row.type;
        if (colId === 'label') return row.label;
        if (colId === 'amount') return row.amount;
        if (colId === 'balance') return row.runningBalance;
        return null;
      }),
    [ledgerRows, ledgerSorting]
  );

  function instalmentLabelForSchedule(scheduleId: string | null): string | null {
    if (!scheduleId) return 'Unassigned receipt';
    const row = schedules.find((s) => s.id === scheduleId);
    if (!row) return null;
    return `${row.instalment_no}. ${row.milestone}`;
  }

  async function generateDemandForSchedule(schedule: ScheduleRow) {
    if (!bookingId) return;
    setGeneratingDemandFor(schedule.id);
    try {
      const received = receivedBySchedule[schedule.id] || 0;
      const pending = Math.max(0, (schedule.amount || 0) - received);
      const persisted = await requestGenerateBookingDocument(bookingId, {
        kind: 'demand-letter',
        linkId: schedule.id,
        htmlOverrides: {
          instalmentLabel: `${schedule.instalment_no}. ${schedule.milestone}`,
          demandAmount: pending > 0 ? pending : schedule.amount,
          demandDueDate: schedule.due_date
        },
        notify: false
      });
      if (!persisted.ok) throw new Error(persisted.error);
      toast.success(
        `Demand letter for instalment ${schedule.instalment_no} saved. Preview it, then Send to notify the customer.`
      );
      await loadFinancials();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Demand letter failed');
    } finally {
      setGeneratingDemandFor(null);
    }
  }

  async function generateReceiptForSchedule(schedule: ScheduleRow) {
    if (!bookingId) return;
    if (!schedule.id) return;
    const latestCollection = latestCollectionByScheduleId.get(schedule.id) ?? null;
    if (!latestCollection) {
      pageError('No collection recorded for this instalment yet. Use Collect first.');
      return;
    }
    setGeneratingReceiptFor(schedule.id);
    try {
      const instalmentLabel = `${schedule.instalment_no}. ${schedule.milestone}`;
      const receiptRes = await persistCollectionReceipt(
        supabase,
        bookingId,
        {
          collectionId: latestCollection.id,
          receivedAmount: latestCollection.received_amount,
          receivedAt: latestCollection.received_at,
          mode: latestCollection.mode,
          reference: latestCollection.reference,
          instalmentLabel
        },
        { notify: false }
      );
      if (!receiptRes.ok) throw new Error(receiptRes.error);
      toast.success(
        `Payment receipt for instalment ${schedule.instalment_no} saved. Preview it, then Send to notify the customer.`
      );
      await loadFinancials();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Receipt failed');
    } finally {
      setGeneratingReceiptFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton href="/crm/financials" label="All financials" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/crm/bookings/${bookingId}`}>Open booking</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/crm/documents/${encodeURIComponent(bookingId)}`}>
            Unit documents
          </Link>
        </Button>
      </div>

      {loading && schedules.length === 0 && collections.length === 0 ? (
        <CrmDetailPageSkeleton />
      ) : (
        <>
      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">
          {projectNameById.get(projectId) ?? 'Project'} · {unitCode}
        </div>
        <p className="mt-0.5 text-sm text-ds-gray-600">{customerName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Final unit price', totalAmount, 'text-ds-gray-900'],
            ['Total received', totalReceived, 'text-ds-success-700'],
            ['Balance', totalBalance, 'text-ds-error-700'],
            [
              'Unassigned receipts',
              collections
                .filter((c) => !c.schedule_id)
                .reduce((s, c) => s + c.received_amount, 0),
              'text-ds-gray-700'
            ]
          ].map(([label, val, tone]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/50 p-3"
            >
              <div className="text-xs text-ds-gray-500">{label}</div>
              <div className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>
                {formatInrCompactLacCr(Number(val))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ds-gray-900">Payment schedule</div>
            <p className="mt-1 text-xs text-ds-gray-500">
              Seeded at booking confirmation; instalment due dates update when the matching
              CLD stage is logged complete on the project.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-ds-gray-200 bg-card">
              <button
                type="button"
                className={`h-8 px-3 text-xs font-semibold ${
                  !showOnlyPending
                    ? 'bg-ds-primary-600 text-white'
                    : 'text-ds-gray-700 hover:bg-ds-gray-50'
                }`}
                onClick={() => setShowOnlyPending(false)}
                disabled={loading || saving}
              >
                All
              </button>
              <button
                type="button"
                className={`h-8 px-3 text-xs font-semibold ${
                  showOnlyPending
                    ? 'bg-ds-primary-600 text-white'
                    : 'text-ds-gray-700 hover:bg-ds-gray-50'
                }`}
                onClick={() => setShowOnlyPending(true)}
                disabled={loading || saving}
                title="Show only milestones with pending balance"
              >
                Pending
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={loading || saving}
              onClick={() => setCreateMilestoneOpen(true)}
              title="Add a new milestone/instalment row"
            >
              Create milestone
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={loading || saving || totalBalance <= 0}
              onClick={() => {
                setManageDefaultScheduleId(null);
                setManageDefaultAmount(Math.max(0, totalBalance));
                setManageOpen(true);
              }}
              title="Record a single receipt for the remaining balance (unassigned)"
            >
              Collect remaining
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <PaymentScheduleTable
            rows={schedules}
            receivedBySchedule={receivedBySchedule}
            receiptsBySchedule={receiptsBySchedule}
            loading={loading}
            onlyUnpaid={showOnlyPending}
            receiptCell={(row) => {
              if (!row.id) return <span className="text-xs text-ds-gray-500">—</span>;
              const latestCollection = latestCollectionByScheduleId.get(row.id) ?? null;
              const doc = latestReceiptDocByScheduleId.get(row.id) ?? null;
              const canGenerate = !saving && !loading && Boolean(latestCollection);
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!canGenerate || generatingReceiptFor === row.id}
                    onClick={() => void generateReceiptForSchedule(row as ScheduleRow)}
                    title={
                      latestCollection
                        ? 'Generate a receipt PDF for the latest collection on this instalment'
                        : 'Collect a payment first'
                    }
                  >
                    {generatingReceiptFor === row.id ? 'Saving…' : doc ? 'Re-generate' : 'Generate'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!doc || receiptPreviewBusyId === doc?.id}
                    onClick={() => (doc ? void previewReceiptDoc(doc) : undefined)}
                    title={doc ? 'Preview saved receipt' : 'Generate a receipt first'}
                  >
                    {receiptPreviewBusyId === doc?.id ? 'Opening…' : 'Preview'}
                  </Button>
                </div>
              );
            }}
            demandCell={(row) => {
              if (!row.id) return <span className="text-xs text-ds-gray-500">—</span>;
              const doc = latestDemandDocByScheduleId.get(row.id) ?? null;
              const canGenerate = !saving && !loading && row.balance > 0;
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!canGenerate || generatingDemandFor === row.id}
                    onClick={() => void generateDemandForSchedule(row as ScheduleRow)}
                    title={
                      row.balance <= 0
                        ? 'No pending amount on this instalment'
                        : `Generate demand for ₹ ${formatInr(row.balance, { maximumFractionDigits: 0 })}`
                    }
                  >
                    {generatingDemandFor === row.id ? 'Saving…' : doc ? 'Re-generate' : 'Generate'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!doc || demandPreviewBusyId === doc?.id}
                    onClick={() => (doc ? void previewDemandDoc(doc) : undefined)}
                    title={doc ? 'Preview saved demand letter' : 'Generate a demand first'}
                  >
                    {demandPreviewBusyId === doc?.id ? 'Opening…' : 'Preview'}
                  </Button>
                </div>
              );
            }}
            actions={(row) => {
              const received = row.received;
              const unpaidMergeTargets = breakableSchedules.filter((s) => s.id !== row.id);
              const canDelete =
                Boolean(row.id) &&
                received === 0 &&
                schedules.length > 1 &&
                unpaidMergeTargets.length > 0;
              return (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    disabled={saving || loading || !row.id}
                    onClick={() => {
                      if (!row.id) return;
                      setEditMilestoneSchedule({
                        id: row.id,
                        instalment_no: row.instalment_no,
                        milestone: row.milestone,
                        due_date: row.due_date,
                        amount: row.amount,
                        received,
                        balance: row.balance
                      });
                    }}
                    title="Edit milestone name, due date, or amount"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-ds-error-700 hover:text-ds-error-800"
                    disabled={saving || loading || !canDelete}
                    onClick={() => {
                      if (!row.id) return;
                      setDeleteMilestoneSchedule({
                        id: row.id,
                        instalment_no: row.instalment_no,
                        milestone: row.milestone,
                        amount: row.amount,
                        received
                      });
                    }}
                    title={
                      received > 0
                        ? 'Cannot delete — collections exist on this instalment'
                        : schedules.length <= 1
                          ? 'Cannot delete the only instalment'
                          : unpaidMergeTargets.length === 0
                            ? 'Cannot delete — no unpaid instalment to return amount to'
                            : 'Delete milestone and return amount to an unpaid instalment'
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={saving || loading || row.balance <= 0 || !row.id}
                    onClick={() => {
                      setManageDefaultScheduleId(row.id ?? null);
                      setManageDefaultAmount(null);
                      setManageOpen(true);
                    }}
                    title="Record a receipt against this instalment"
                  >
                    Collect
                  </Button>
                </div>
              );
            }}
          />
        </div>
        <p className="mt-3 text-xs text-ds-gray-500">
          Use <span className="font-semibold text-ds-gray-900">Edit</span> or{' '}
          <span className="font-semibold text-ds-gray-900">Delete</span> on a milestone (delete only
          when nothing has been collected). Use <span className="font-semibold text-ds-gray-900">Demand</span>{' '}
          to store the demand letter in Documents, and{' '}
          <span className="font-semibold text-ds-gray-900">Collect</span> to record a receipt
          (auto-saves a payment receipt PDF).
        </p>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">Account ledger</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Debit rows are instalment demands; credit rows are collections. Balance is demand minus
          receipts (updates when you save a collection or when token is posted at confirmation).
        </p>
        <div className="mt-3">
          <BookingLedgerTable
            rows={sortedLedgerRows}
            loading={loading}
            sorting={ledgerSorting}
            onSortingChange={onLedgerSortingChange}
          />
        </div>
      </Card>
        </>
      )}

      <CollectionManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        bookingId={bookingId}
        loading={loading}
        schedules={schedules}
        pendingSchedules={pendingSchedules}
        collections={collections}
        scheduleLabelById={scheduleLabelById}
        defaultScheduleId={manageDefaultScheduleId}
        defaultAmount={manageDefaultAmount}
        onSaved={() => loadFinancials()}
      />

      <CreateMilestoneDialog
        open={createMilestoneOpen}
        onOpenChange={setCreateMilestoneOpen}
        bookingId={bookingId}
        loading={loading}
        nextInstalmentNo={nextInstalmentNo}
        pendingAmount={Math.max(0, totalBalance)}
        breakableSchedules={breakableSchedules}
        onSaved={() => loadFinancials()}
      />

      <EditMilestoneDialog
        open={editMilestoneSchedule !== null}
        onOpenChange={(open) => {
          if (!open) setEditMilestoneSchedule(null);
        }}
        bookingId={bookingId}
        loading={loading}
        schedule={editMilestoneSchedule}
        takeFromSchedules={breakableSchedules.filter(
          (s) => s.id !== editMilestoneSchedule?.id
        )}
        returnToSchedules={schedules
          .filter((s) => s.id !== editMilestoneSchedule?.id)
          .map((s) => ({
            id: s.id,
            instalment_no: s.instalment_no,
            milestone: s.milestone
          }))}
        onSaved={() => loadFinancials()}
      />

      <DeleteMilestoneDialog
        open={deleteMilestoneSchedule !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteMilestoneSchedule(null);
        }}
        loading={loading}
        schedule={deleteMilestoneSchedule}
        mergeTargets={breakableSchedules.filter(
          (s) => s.id !== deleteMilestoneSchedule?.id
        )}
        onDeleted={() => loadFinancials()}
      />

      <PdfViewerDialog
        open={viewerOpen}
        onOpenChange={(open) => {
          setViewerOpen(open);
          if (!open) {
            setViewerUrl('');
            setViewerSendDoc(null);
          }
        }}
        url={viewerUrl}
        title={viewerTitle}
        primaryActionLabel={
          viewerSendDoc?.kind === 'receipt'
            ? 'Send receipt'
            : viewerSendDoc?.kind === 'demand-letter'
              ? 'Send demand'
              : undefined
        }
        primaryActionLoading={
          viewerSendDoc?.kind === 'receipt'
            ? receiptSendBusyId === viewerSendDoc.doc.id
            : viewerSendDoc?.kind === 'demand-letter'
              ? demandSendBusyId === viewerSendDoc.doc.id
              : false
        }
        primaryActionDisabled={!viewerSendDoc}
        onPrimaryAction={() => {
          if (!viewerSendDoc) return;
          if (viewerSendDoc.kind === 'receipt') {
            void sendReceiptDoc(viewerSendDoc.doc);
            return;
          }
          void sendDemandDoc(viewerSendDoc.doc);
        }}
      />
    </div>
  );
}
