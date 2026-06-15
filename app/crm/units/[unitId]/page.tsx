'use client';

import Link from 'next/link';
import { pageError } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  GeneratedDocumentsTable,
  type GeneratedDocRow
} from '@/app/crm/documents/generated-documents-table';
import { GENERATED_DOCUMENTS_LIST_SELECT } from '@/lib/crm/generated-documents-select';
import {
  BookingLedgerTable,
  buildBookingLedgerRows,
  type BookingLedgerCollectionInput,
  type BookingLedgerScheduleInput
} from '@/app/crm/financials/booking-ledger-table';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  statusLabelForUnit
} from '@/app/crm/inventory/unit-status';
import { formatInr } from '@/app/crm/inr-format';

type UnitDetail = {
  id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  status: string;
  project_id: string;
  projects: { name: string; location: string | null } | { name: string; location: string | null }[] | null;
};

type BookingForUnit = {
  id: string;
  workflow_stage: string;
  status: string;
  created_at: string;
  customer_id: string;
  customers: { full_name: string } | { full_name: string }[] | null;
};

type OutboundNotificationRow = {
  id: string;
  booking_id: string | null;
  channel: 'email' | 'whatsapp' | 'sms';
  provider: 'resend' | 'smtp' | 'meta_cloud' | 'smsalert';
  status: 'queued' | 'sent' | 'failed' | 'delivered' | 'read' | 'skipped';
  template_name: string | null;
  recipient: string | null;
  error: string | null;
  attempts: number;
  processed_at: string | null;
  created_at: string;
};

type Tab = 'overview' | 'documents' | 'ledger' | 'notifications';

function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function UnitDetailPage() {
  const params = useParams();
  const unitId = String(params.unitId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [tab, setTab] = useState<Tab>('overview');
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [bookings, setBookings] = useState<BookingForUnit[]>([]);
  const [activeBookingId, setActiveBookingId] = useState<string>('');
  const [generated, setGenerated] = useState<GeneratedDocRow[]>([]);
  const [schedules, setSchedules] = useState<BookingLedgerScheduleInput[]>([]);
  const [collections, setCollections] = useState<BookingLedgerCollectionInput[]>([]);
  const [notifications, setNotifications] = useState<OutboundNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    
    const { data: unitData, error: uErr } = await supabase
      .from('units')
      .select(
        'id,unit_code,wing_name,floor,unit_type,status,project_id,projects(name,location)'
      )
      .eq('id', unitId)
      .maybeSingle();
    if (uErr) {
      pageError(uErr.message);
      setLoading(false);
      return;
    }
    if (!unitData) {
      pageError('Unit not found.');
      setLoading(false);
      return;
    }
    setUnit(unitData as UnitDetail);

    const { data: bookingRows, error: bErr } = await supabase
      .from('bookings')
      .select('id,workflow_stage,status,created_at,customer_id,customers(full_name)')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (bErr) pageError(bErr.message);
    const rows = (bookingRows ?? []) as BookingForUnit[];
    setBookings(rows);

    const primary = rows.find((b) => b.status !== 'cancelled') ?? rows[0];
    const primaryBookingId = primary?.id ?? '';
    setActiveBookingId(primaryBookingId);

    if (primaryBookingId) {
      const [docsRes, schRes, colRes, notifyRes] = await Promise.all([
        supabase
          .from('generated_documents')
          .select(GENERATED_DOCUMENTS_LIST_SELECT)
          .eq('booking_id', primaryBookingId)
          .order('generated_at', { ascending: false })
          .limit(500),
        supabase
          .from('payment_schedules')
          .select('id,instalment_no,milestone,due_date,amount')
          .eq('booking_id', primaryBookingId)
          .order('instalment_no', { ascending: true }),
        supabase
          .from('collections')
          .select('id,schedule_id,received_amount,received_at,mode,reference,created_at')
          .eq('booking_id', primaryBookingId)
          .order('received_at', { ascending: true }),
        supabase
          .from('outbound_notifications')
          .select(
            'id,booking_id,channel,provider,status,template_name,recipient,error,attempts,processed_at,created_at'
          )
          .eq('unit_id', unitId)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      if (docsRes.error) pageError(docsRes.error.message);
      setGenerated((docsRes.data ?? []) as GeneratedDocRow[]);

      if (schRes.error) pageError(schRes.error.message);
      setSchedules((schRes.data ?? []) as BookingLedgerScheduleInput[]);

      if (colRes.error) pageError(colRes.error.message);
      setCollections((colRes.data ?? []) as BookingLedgerCollectionInput[]);

      if (notifyRes.error) pageError(notifyRes.error.message);
      setNotifications((notifyRes.data ?? []) as OutboundNotificationRow[]);
    } else {
      setGenerated([]);
      setSchedules([]);
      setCollections([]);
      const { data: nRows } = await supabase
        .from('outbound_notifications')
        .select(
          'id,booking_id,channel,provider,status,template_name,recipient,error,attempts,processed_at,created_at'
        )
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false })
        .limit(200);
      setNotifications((nRows ?? []) as OutboundNotificationRow[]);
    }
    setLoading(false);
  }, [supabase, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectInfo = unwrapJoin(unit?.projects);

  const scheduleLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of schedules) {
      m.set(s.id, `${s.instalment_no}. ${s.milestone}`);
    }
    for (const c of collections) {
      if (c.schedule_id && m.has(c.schedule_id)) {
        m.set(c.id, m.get(c.schedule_id)!);
      } else if (!c.schedule_id) {
        m.set(c.id, 'Unassigned receipt');
      }
    }
    return m;
  }, [schedules, collections]);

  const ledgerRows = useMemo(
    () => buildBookingLedgerRows(schedules, collections, scheduleLabelById),
    [schedules, collections, scheduleLabelById]
  );

  const totalDemand = schedules.reduce((sum, s) => sum + Math.round(Number(s.amount || 0)), 0);
  const totalReceived = collections.reduce(
    (sum, c) => sum + Math.round(Number(c.received_amount || 0)),
    0
  );
  const outstanding = Math.max(0, totalDemand - totalReceived);

  const status = String(unit?.status ?? '').toUpperCase();
  const statusColor = STATUS_COLOR[status] ?? '#64748B';
  const statusLabel = STATUS_LABEL[status] ?? statusLabelForUnit(unit?.status);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            className="inline-flex items-center gap-1 text-sm text-ds-gray-600 hover:text-ds-gray-800"
            href="/crm/inventory"
          >
            <ArrowLeft className="h-4 w-4" />
            Inventory
          </Link>
          <h1 className="text-xl font-semibold text-ds-gray-900">
            {unit?.unit_code ?? 'Unit'}
          </h1>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${statusColor}1a`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-ds-gray-500">Project</p>
            <p className="font-medium text-ds-gray-800">{projectInfo?.name ?? '—'}</p>
            {projectInfo?.location ? (
              <p className="text-xs text-ds-gray-500">{projectInfo.location}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ds-gray-500">Wing · Floor</p>
            <p className="font-medium text-ds-gray-800">
              {unit ? `${unit.wing_name} · Floor ${unit.floor}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ds-gray-500">Type</p>
            <p className="font-medium text-ds-gray-800">{unit?.unit_type ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ds-gray-500">Outstanding</p>
            <p className="font-medium text-ds-gray-800">
              {schedules.length === 0 ? '—' : formatInr(outstanding)}
            </p>
            {schedules.length > 0 ? (
              <p className="text-xs text-ds-gray-500">
                of {formatInr(totalDemand)} demanded · {formatInr(totalReceived)} received
              </p>
            ) : null}
          </div>
        </div>
        {bookings.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ds-gray-600">
            <span className="font-semibold">Bookings on this unit:</span>
            {bookings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={
                  b.id === activeBookingId
                    ? 'rounded-full bg-ds-primary-500 px-2 py-1 text-white'
                    : 'rounded-full border border-ds-gray-200 px-2 py-1'
                }
                onClick={() => setActiveBookingId(b.id)}
              >
                {unwrapJoin(b.customers)?.full_name ??
                  formatBookingDisplayId(b.id, b.created_at)}{' '}
                · {b.workflow_stage}
                {b.status === 'cancelled' ? ' · cancelled' : ''}
              </button>
            ))}
          </div>
        ) : null}
        {activeBookingId ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              className="rounded-full border border-ds-gray-200 px-2 py-1 text-ds-primary-700 hover:bg-ds-primary-50"
              href={`/crm/bookings/${activeBookingId}`}
            >
              Open booking
            </Link>
            <Link
              className="rounded-full border border-ds-gray-200 px-2 py-1 text-ds-primary-700 hover:bg-ds-primary-50"
              href={`/crm/financials/${activeBookingId}`}
            >
              Open financials
            </Link>
            <Link
              className="rounded-full border border-ds-gray-200 px-2 py-1 text-ds-primary-700 hover:bg-ds-primary-50"
              href={`/crm/documents/${activeBookingId}`}
            >
              Open documents
            </Link>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-ds-gray-200">
        {(['overview', 'documents', 'ledger', 'notifications'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={
              tab === t
                ? 'border-b-2 border-ds-primary-500 px-3 py-2 text-sm font-semibold text-ds-primary-700'
                : 'px-3 py-2 text-sm text-ds-gray-600 hover:text-ds-gray-900'
            }
            onClick={() => setTab(t)}
          >
            {t === 'overview'
              ? 'Overview'
              : t === 'documents'
                ? `Documents (${generated.length})`
                : t === 'ledger'
                  ? `Ledger (${ledgerRows.length})`
                  : `Notifications (${notifications.length})`}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <Card className="space-y-3 p-4 text-sm">
          <h2 className="text-base font-semibold text-ds-gray-800">Unit summary</h2>
          {loading ? (
            <p className="text-ds-gray-500">Loading…</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <li>
                <span className="text-ds-gray-500">Current status:</span>{' '}
                <span className="font-medium">{statusLabel}</span>
              </li>
              <li>
                <span className="text-ds-gray-500">Active booking:</span>{' '}
                <span className="font-medium">
                  {activeBookingId
                    ? `${formatBookingDisplayId(
                        activeBookingId,
                        bookings.find((b) => b.id === activeBookingId)?.created_at
                      )} · ${
                        bookings.find((b) => b.id === activeBookingId)?.workflow_stage ??
                        '—'
                      }`
                    : 'No active booking'}
                </span>
              </li>
              <li>
                <span className="text-ds-gray-500">Documents generated:</span>{' '}
                <span className="font-medium">{generated.length}</span>
              </li>
              <li>
                <span className="text-ds-gray-500">Notifications dispatched:</span>{' '}
                <span className="font-medium">
                  {notifications.filter((n) => n.status === 'sent' || n.status === 'delivered' || n.status === 'read').length}
                </span>
              </li>
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'documents' ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ds-gray-800">Documents for this unit</h2>
          {activeBookingId ? (
            <GeneratedDocumentsTable
              rows={generated}
              loading={loading}
              variant="bookingFocus"
              showDownload
              scheduleLabelById={scheduleLabelById}
              onRefresh={() => void load()}
            />
          ) : (
            <p className="text-sm text-ds-gray-500">No booking on this unit yet.</p>
          )}
        </Card>
      ) : null}

      {tab === 'ledger' ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ds-gray-800">Unit ledger</h2>
          {activeBookingId ? (
            <BookingLedgerTable rows={ledgerRows} loading={loading} />
          ) : (
            <p className="text-sm text-ds-gray-500">No ledger yet — book the unit to create one.</p>
          )}
        </Card>
      ) : null}

      {tab === 'notifications' ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ds-gray-800">Outbound notifications</h2>
          <NotificationsList rows={notifications} loading={loading} />
        </Card>
      ) : null}
    </div>
  );
}

function NotificationsList({
  rows,
  loading
}: {
  rows: OutboundNotificationRow[];
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-ds-gray-500">Loading…</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-ds-gray-500">No notifications yet for this unit.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table className="w-full min-w-3xl caption-bottom text-sm">
        <thead className="bg-ds-gray-50 text-left text-xs font-semibold text-ds-gray-500">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2">Recipient</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Template</th>
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ds-gray-100">
              <td className="px-3 py-2 text-xs text-ds-gray-600">
                {formatDisplayDateTime(r.processed_at ?? r.created_at)}
              </td>
              <td className="px-3 py-2 capitalize">{r.channel}</td>
              <td className="px-3 py-2 text-xs text-ds-gray-700">{r.recipient ?? '—'}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2 text-xs text-ds-gray-700">{r.template_name ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-ds-error-700">{r.error ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: OutboundNotificationRow['status'] }) {
  const color =
    status === 'sent' || status === 'delivered' || status === 'read'
      ? '#0d9488'
      : status === 'failed'
        ? '#dc2626'
        : status === 'skipped'
          ? '#64748b'
          : '#f97316';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {status}
    </span>
  );
}
