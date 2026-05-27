'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInr, formatInrCompactLacCr } from '../../inr-format';
import { PaymentScheduleTable } from '../payment-schedule-table';
import {
  BookingLedgerTable,
  buildBookingLedgerRows
} from '../booking-ledger-table';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import { CollectionManageDialog } from '../collection-manage-dialog';

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

export default function FinancialsBookingPage() {
  const params = useParams();
  const bookingId = String(params.bookingId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
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
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDefaultScheduleId, setManageDefaultScheduleId] = useState<string | null>(
    null
  );
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

    const [{ data: unit }, { data: customer }, schedRes, collRes] =
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
          .order('created_at', { ascending: false })
      ]);

    setUnitCode((unit?.unit_code as string) ?? '—');
    setCustomerName((customer?.full_name as string) ?? '—');

    if (schedRes.error) pageError(schedRes.error.message);
    if (collRes.error) pageError(collRes.error.message);
    setSchedules((schedRes.data ?? []) as ScheduleRow[]);
    setCollections((collRes.data ?? []) as CollectionRow[]);
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
        `Demand letter for instalment ${schedule.instalment_no} saved. Review in Documents, then Send to notify the customer.`
      );
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Demand letter failed');
    } finally {
      setGeneratingDemandFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1" asChild>
          <Link href="/crm/financials">
            <ArrowLeft className="h-4 w-4" />
            All financials
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/crm/bookings/${bookingId}`}>Open booking</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/crm/documents/${encodeURIComponent(bookingId)}`}>
            Unit documents
          </Link>
        </Button>
      </div>

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
        <div className="text-sm font-semibold text-ds-gray-900">Payment schedule</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Seeded at booking confirmation; instalment due dates update when the matching
          CLD stage is logged complete on the project.
        </p>
        <div className="mt-3">
          <PaymentScheduleTable
            rows={schedules}
            receivedBySchedule={receivedBySchedule}
            loading={loading}
            onlyUnpaid
            actions={(row) => (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={
                    saving ||
                    loading ||
                    row.balance <= 0 ||
                    generatingDemandFor === (row.id ?? '')
                  }
                  onClick={() =>
                    row.id ? void generateDemandForSchedule(row as ScheduleRow) : undefined
                  }
                  title={
                    row.balance <= 0
                      ? 'No pending amount on this instalment'
                      : `Demand for ₹ ${formatInr(row.balance, { maximumFractionDigits: 0 })}`
                  }
                >
                  {generatingDemandFor === (row.id ?? '') ? 'Saving…' : 'Demand'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={saving || loading || row.balance <= 0 || !row.id}
                  onClick={() => {
                    setManageDefaultScheduleId(row.id ?? null);
                    setManageOpen(true);
                  }}
                  title="Record a receipt against this instalment"
                >
                  Collect
                </Button>
              </div>
            )}
          />
        </div>
        <p className="mt-3 text-xs text-ds-gray-500">
          Use <span className="font-semibold text-ds-gray-900">Demand</span> to store the demand
          letter in Documents, and <span className="font-semibold text-ds-gray-900">Collect</span>{' '}
          to record a receipt (auto-saves a payment receipt PDF).
        </p>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ds-gray-900">Collections</div>
            <p className="mt-1 text-xs text-ds-gray-500">
              Add, delete, and regenerate receipts for payment collections.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setManageDefaultScheduleId(null);
                setManageOpen(true);
              }}
            >
              Manage
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="text-sm font-semibold text-ds-gray-900">Account ledger</div>
        <p className="mt-1 text-xs text-ds-gray-500">
          Debit rows are instalment demands; credit rows are collections. Balance is demand minus
          receipts (updates when you save a collection or when token is posted at confirmation).
        </p>
        <div className="mt-3">
          <BookingLedgerTable rows={ledgerRows} loading={loading} />
        </div>
      </Card>

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
        onSaved={() => loadFinancials()}
      />
    </div>
  );
}
