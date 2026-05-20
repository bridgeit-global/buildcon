'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, Upload } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BOOKING_WORKFLOW_LABEL,
  BOOKING_WORKFLOW_STAGES,
  type BookingDetailRow,
  type BookingStageData,
  type BookingWorkflowStage,
  type CoBuyerStored
} from '../booking-types';
import {
  canAdvanceWorkflowStage,
  isTokenStageLocked
} from '../booking-stage-transitions';
import { isCustomerKycComplete } from '@/lib/customer/kyc-identifiers';
import { PaymentScheduleTable } from '../../financials/payment-schedule-table';
import { loadBookingPrintPack, type BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { generateAndNotifyBookingDocument } from '@/lib/booking/generate-and-notify-booking-document';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { GENERATED_DOCUMENTS_LIST_SELECT } from '@/lib/crm/generated-documents-select';
import {
  BookingDocumentsMatrixTable,
  buildMatrixRows
} from '@/app/crm/documents/booking-documents-matrix-table';
import type { GeneratedDocRow } from '@/app/crm/documents/generated-documents-table';

const KYC_BUCKET = 'kyc';
function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

function extensionFromFile(file: File) {
  const name = file.name || '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

type BuyerKyc = {
  customerId: string;
  label: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  pan: string;
  aadhaarLast4: string;
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
};

export default function BookingDetailPage() {
  const params = useParams();
  const bookingId = String(params.id ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<BookingDetailRow | null>(null);
  const [stageData, setStageData] = useState<BookingStageData>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [refundPreview, setRefundPreview] = useState<{
    refund_amount: number;
    deduction_amount: number;
    total_collected: number;
    policy_notes: string;
  } | null>(null);

  const [buyerKyc, setBuyerKyc] = useState<BuyerKyc[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectLocation, setProjectLocation] = useState<string | null>(null);
  const kycFileRef = useRef<HTMLInputElement>(null);
  const [kycUploadCustomerId, setKycUploadCustomerId] = useState('');
  const [kycDocType, setKycDocType] = useState('pan');
  const [paymentSchedules, setPaymentSchedules] = useState<
    {
      id: string;
      instalment_no: number;
      milestone: string;
      due_date: string | null;
      amount: number;
    }[]
  >([]);
  const [scheduleReceivedById, setScheduleReceivedById] = useState<
    Record<string, number>
  >({});
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [confirmationPrintPack, setConfirmationPrintPack] = useState<BookingPrintPack | null>(
    null
  );
  const [confirmationDocsLoading, setConfirmationDocsLoading] = useState(false);
  const [confirmationGenerated, setConfirmationGenerated] = useState<GeneratedDocRow[]>([]);
  const [generatingDocKind, setGeneratingDocKind] = useState<BookingDocumentPrintKind | null>(null);
  const [docDeliveryBanner, setDocDeliveryBanner] = useState('');

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('bookings')
      .select(
        `
        id, project_id, unit_id, customer_id, sales_inquiry_id,
        created_at, updated_at, stage, workflow_stage, status,
        payment_mode, loan_bank, booking_amount, co_buyers, payment_detail, stage_data,
        units ( unit_code, wing_name, floor, unit_type, status ),
        customers ( full_name, phone, email, occupation, pan_number, aadhaar_last4 )
      `
      )
      .eq('id', bookingId)
      .maybeSingle();

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setError('Booking not found');
      setLoading(false);
      return;
    }

    const row = data as unknown as BookingDetailRow;
    setBooking(row);

    const stage = (row.stage_data ?? {}) as BookingStageData;
    const primary = unwrapJoin(row.customers);

    const [{ data: projectRow }, { data: addrRows }] = await Promise.all([
      supabase
        .from('projects')
        .select('name, location')
        .eq('id', row.project_id)
        .maybeSingle(),
      supabase
        .from('customer_addresses')
        .select('kind,address_line1,city,state,pin')
        .eq('customer_id', row.customer_id)
        .order('created_at', { ascending: true })
    ]);
    setProjectName((projectRow?.name as string) ?? null);
    setProjectLocation((projectRow?.location as string) ?? null);

    const currentAddr =
      (addrRows ?? []).find((a) => a.kind === 'current') ?? addrRows?.[0];
    const app = stage.application ?? {};
    setStageData({
      ...stage,
      application: {
        ...app,
        occupation: app.occupation || primary?.occupation || undefined,
        address_line1:
          app.address_line1 || (currentAddr?.address_line1 as string) || undefined,
        city: app.city || (currentAddr?.city as string) || undefined,
        state: app.state || (currentAddr?.state as string) || undefined,
        pin: app.pin || (currentAddr?.pin as string) || undefined
      }
    });
    const co = (row.co_buyers ?? []) as CoBuyerStored[];
    const buyerIds = [
      { id: row.customer_id, label: primary?.full_name ?? 'Primary buyer' },
      ...co.map((c) => ({
        id: c.customer_id,
        label: c.full_name || 'Co-applicant'
      }))
    ];

    const { data: kycRows } = await supabase
      .from('customer_kyc_documents')
      .select('customer_id,doc_type')
      .in(
        'customer_id',
        buyerIds.map((b) => b.id)
      );

    const buyerIdList = buyerIds.map((b) => b.id);

    const { data: custRows } = await supabase
      .from('customers')
      .select(
        'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address'
      )
      .in('id', buyerIdList);

    const custById = new Map((custRows ?? []).map((c) => [c.id as string, c]));
    const docsByCustomer = new Map<string, Set<string>>();
    for (const doc of kycRows ?? []) {
      const cid = doc.customer_id as string;
      if (!docsByCustomer.has(cid)) docsByCustomer.set(cid, new Set());
      docsByCustomer.get(cid)!.add(String(doc.doc_type));
    }

    setBuyerKyc(
      buyerIds.map((b) => {
        const c = custById.get(b.id);
        const docs = docsByCustomer.get(b.id) ?? new Set();
        return {
          customerId: b.id,
          label: b.label,
          fullName: String(c?.full_name ?? b.label),
          phone: (c?.phone as string | null) ?? null,
          email: (c?.email as string | null) ?? null,
          occupation: (c?.occupation as string | null) ?? null,
          pan: String(c?.pan_number ?? ''),
          aadhaarLast4: String(c?.aadhaar_last4 ?? ''),
          hasPanDoc: docs.has('pan'),
          hasAadhaarDoc: docs.has('aadhaar')
        };
      })
    );
    setLoading(false);
  }, [bookingId, supabase]);

  const loadPaymentSchedule = useCallback(async () => {
    if (!bookingId) return;
    setLoadingSchedule(true);
    try {
      await fetch(
        `/api/crm/bookings/${encodeURIComponent(bookingId)}/sync-schedule`,
        { method: 'POST', credentials: 'same-origin' }
      );
    } catch {
      /* non-blocking */
    }
    const [{ data: sData, error: sErr }, { data: cData, error: cErr }] =
      await Promise.all([
        supabase
          .from('payment_schedules')
          .select('id,instalment_no,milestone,due_date,amount')
          .eq('booking_id', bookingId)
          .order('instalment_no', { ascending: true }),
        supabase
          .from('collections')
          .select('schedule_id,received_amount')
          .eq('booking_id', bookingId)
      ]);
    if (!sErr) setPaymentSchedules((sData ?? []) as typeof paymentSchedules);
    if (!cErr) {
      const map: Record<string, number> = {};
      for (const c of cData ?? []) {
        const sid = c.schedule_id as string | null;
        if (!sid) continue;
        map[sid] = (map[sid] || 0) + Number(c.received_amount || 0);
      }
      setScheduleReceivedById(map);
    }
    setLoadingSchedule(false);
  }, [bookingId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      booking?.workflow_stage === 'confirmation' ||
      booking?.status === 'cancelled'
    ) {
      void loadPaymentSchedule();
    }
  }, [booking?.workflow_stage, booking?.status, loadPaymentSchedule]);

  const workflowStage = (booking?.workflow_stage ?? 'token') as BookingWorkflowStage;
  const cancelled = booking?.status === 'cancelled';

  const refreshConfirmationGenerated = useCallback(async () => {
    if (!bookingId) return;
    const { data, error: gErr } = await supabase
      .from('generated_documents')
      .select(GENERATED_DOCUMENTS_LIST_SELECT)
      .eq('booking_id', bookingId)
      .order('generated_at', { ascending: false })
      .limit(200);
    if (gErr) {
      setError(gErr.message);
      return;
    }
    setConfirmationGenerated((data ?? []) as GeneratedDocRow[]);
  }, [bookingId, supabase]);

  useEffect(() => {
    if (!bookingId || workflowStage !== 'confirmation' || cancelled) {
      setConfirmationPrintPack(null);
      setConfirmationGenerated([]);
      setConfirmationDocsLoading(false);
      setDocDeliveryBanner('');
      return;
    }
    let ignore = false;
    (async () => {
      setConfirmationDocsLoading(true);
      const [packRes, genRes] = await Promise.all([
        loadBookingPrintPack(supabase, bookingId),
        supabase
          .from('generated_documents')
          .select(GENERATED_DOCUMENTS_LIST_SELECT)
          .eq('booking_id', bookingId)
          .order('generated_at', { ascending: false })
          .limit(200)
      ]);
      if (ignore) return;
      if (packRes.ok) setConfirmationPrintPack(packRes.pack);
      else setConfirmationPrintPack(null);
      if (genRes.error) setError(genRes.error.message);
      else setConfirmationGenerated((genRes.data ?? []) as GeneratedDocRow[]);
      setConfirmationDocsLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [bookingId, workflowStage, cancelled, supabase]);

  const confirmationMatrixRows = useMemo(
    () => buildMatrixRows(confirmationGenerated),
    [confirmationGenerated]
  );

  const handleConfirmationDocGenerate = useCallback(
    async (kind: BookingDocumentPrintKind) => {
      if (!confirmationPrintPack) return;
      setGeneratingDocKind(kind);
      setDocDeliveryBanner('');
      try {
        const r = await generateAndNotifyBookingDocument({
          supabase,
          bookingId: confirmationPrintPack.booking.id,
          pack: confirmationPrintPack,
          kind
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const n = r.notify;
        const bits: string[] = [];
        if (n.emailSent) bits.push('Customer email sent.');
        if (n.emailSkippedReason) bits.push(`Email: ${n.emailSkippedReason}`);
        if (n.whatsappUrl) {
          window.open(n.whatsappUrl, '_blank', 'noopener,noreferrer');
          bits.push(
            'WhatsApp opened with a prefilled message — press Send to deliver to the customer.'
          );
        } else if (n.whatsappSkippedReason) {
          bits.push(`WhatsApp: ${n.whatsappSkippedReason}`);
        }
        setDocDeliveryBanner(bits.join(' '));
        await refreshConfirmationGenerated();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generate failed');
      } finally {
        setGeneratingDocKind(null);
      }
    },
    [confirmationPrintPack, supabase, refreshConfirmationGenerated]
  );

  const stepIndex = BOOKING_WORKFLOW_STAGES.indexOf(workflowStage);
  const tokenStageLocked = useMemo(
    () => isTokenStageLocked(stageData, workflowStage),
    [stageData, workflowStage]
  );

  const kycComplete = useMemo(
    () =>
      buyerKyc.every((b) =>
        isCustomerKycComplete(b.pan, b.aadhaarLast4, [
          ...(b.hasPanDoc ? ['pan'] : []),
          ...(b.hasAadhaarDoc ? ['aadhaar'] : [])
        ])
      ),
    [buyerKyc]
  );

  const buyersNeedingKyc = useMemo(
    () =>
      buyerKyc.filter(
        (b) =>
          !isCustomerKycComplete(b.pan, b.aadhaarLast4, [
            ...(b.hasPanDoc ? ['pan'] : []),
            ...(b.hasAadhaarDoc ? ['aadhaar'] : [])
          ])
      ),
    [buyerKyc]
  );

  async function saveStagePatch(patch: Record<string, unknown>) {
    if (!booking || cancelled) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', stageDataPatch: patch })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Save failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function stagePatchForAdvance(): Record<string, unknown> {
    if (workflowStage === 'token') {
      return {
        amount: stageData.token?.amount ?? String(booking?.booking_amount ?? ''),
        date: stageData.token?.date ?? '',
        mode: stageData.token?.mode ?? booking?.payment_mode ?? ''
      };
    }
    if (workflowStage === 'application') {
      return {
        occupation: stageData.application?.occupation,
        address_line1: stageData.application?.address_line1,
        submitted_at:
          stageData.application?.submitted_at ?? new Date().toISOString().slice(0, 10)
      };
    }
    if (workflowStage === 'allotment') {
      return {
        allotment_date: stageData.allotment?.allotment_date,
        allotment_letter_ref: stageData.allotment?.allotment_letter_ref
      };
    }
    return {};
  }

  async function advanceStage() {
    if (!booking || cancelled) return;
    const merged = { ...stageData, [workflowStage]: { ...stageData[workflowStage], ...stagePatchForAdvance() } };
    const check = canAdvanceWorkflowStage(workflowStage, merged, { kycComplete });
    if (!check.ok) {
      setError(check.reason ?? 'Cannot advance');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          stageDataPatch: stagePatchForAdvance()
        })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Advance failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Advance failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveBuyerIdentifiers(b: BuyerKyc) {
    if (!booking) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: b.customerId,
          panNumber: b.pan,
          aadhaarLast4: b.aadhaarLast4
        })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function uploadKyc() {
    const file = kycFileRef.current?.files?.[0];
    if (!file || !kycUploadCustomerId) return;
    setSaving(true);
    setError('');
    const ext = extensionFromFile(file);
    const path = `customer/${kycUploadCustomerId}/${kycDocType}/${crypto.randomUUID()}${ext}`;
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: storageErr } = await supabase.storage
        .from(KYC_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (storageErr) throw storageErr;
      const { error: insErr } = await supabase.from('customer_kyc_documents').insert({
        customer_id: kycUploadCustomerId,
        doc_type: kycDocType,
        storage_path: path,
        uploaded_by: user?.id ?? null,
        verified_status: 'Pending'
      });
      if (insErr) {
        await supabase.storage.from(KYC_BUCKET).remove([path]);
        throw insErr;
      }
      if (kycFileRef.current) kycFileRef.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  async function submitCancellation() {
    if (!booking) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason,
          notes: cancelNotes
        })
      });
      const json = (await res.json()) as {
        error?: string;
        refund?: {
          refund_amount: number;
          deduction_amount: number;
          total_collected: number;
          policy_notes: string;
        };
      };
      if (!res.ok) throw new Error(json.error || 'Cancellation failed');
      setRefundPreview(json.refund ?? null);
      setCancelOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancellation failed');
    } finally {
      setSaving(false);
    }
  }

  const unit = booking ? unwrapJoin(booking.units) : null;
  const customer = booking ? unwrapJoin(booking.customers) : null;

  return (
    <div className="mx-auto  space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="h-9 gap-1" asChild>
          <Link href="/crm/bookings">
            <ArrowLeft className="h-4 w-4" />
            Bookings
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-ds-gray-900">
            {unit?.unit_code ?? 'Booking'} · {customer?.full_name ?? '—'}
          </h1>
          <p className="text-sm text-ds-gray-500">
            Unit locked while workflow is active. Complete each step to confirm the booking.
          </p>
        </div>
        {!loading && booking && workflowStage === 'confirmation' && !cancelled ? (
          <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1" asChild>
            <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
              <FileText className="h-4 w-4" />
              Documents
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-ds-error-200 bg-ds-error-50 px-3 py-2 text-sm text-ds-error-800">
          {error}
        </div>
      ) : null}

      {refundPreview ? (
        <Card className="border-ds-warning-200 bg-ds-warning-50/50 p-4">
          <p className="text-sm font-semibold text-ds-gray-900">Refund calculated</p>
          <p className="mt-1 text-sm text-ds-gray-600">{refundPreview.policy_notes}</p>
          <p className="mt-2 text-sm tabular-nums text-ds-gray-800">
            Collected ₹{Number(refundPreview.total_collected).toLocaleString('en-IN')} ·
            Deduction ₹{Number(refundPreview.deduction_amount).toLocaleString('en-IN')} ·
            Refund ₹{Number(refundPreview.refund_amount).toLocaleString('en-IN')}
          </p>
        </Card>
      ) : null}

      <Card className="p-4">
        <ol className="flex flex-wrap gap-2">
          {BOOKING_WORKFLOW_STAGES.map((stage, i) => {
            const done = i < stepIndex || workflowStage === 'confirmation';
            const active = stage === workflowStage && !cancelled;
            return (
              <li
                key={stage}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                  done
                    ? 'bg-ds-primary-500 text-white'
                    : active
                      ? 'border-2 border-ds-primary-500 text-ds-primary-700'
                      : 'bg-ds-gray-100 text-ds-gray-500'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : null}
                {BOOKING_WORKFLOW_LABEL[stage]}
              </li>
            );
          })}
        </ol>
      </Card>

      {loading ? (
        <p className="text-sm text-ds-gray-500">Loading…</p>
      ) : !booking ? null : (
        <>
          {workflowStage === 'token' && !cancelled ? (
            <Card className="space-y-4 p-4">
              <h2 className="font-semibold text-ds-gray-900">Token received</h2>
              {tokenStageLocked ? (
                <>
                  <p className="text-sm text-ds-gray-600">
                    Token was recorded when this booking was created (from inquiry or the
                    bookings form). Token details cannot be changed. Continue to the
                    application form.
                  </p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-ds-gray-500">Amount</dt>
                      <dd className="font-medium tabular-nums text-ds-gray-900">
                        ₹{' '}
                        {Number(
                          stageData.token?.amount ?? booking.booking_amount ?? 0
                        ).toLocaleString('en-IN')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ds-gray-500">Date</dt>
                      <dd className="font-medium text-ds-gray-900">
                        {stageData.token?.date ?? '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-ds-gray-500">Payment mode</dt>
                      <dd className="font-medium text-ds-gray-900">
                        {stageData.token?.mode ?? booking.payment_mode ?? '—'}
                      </dd>
                    </div>
                  </dl>
                  <Button disabled={saving} onClick={() => void advanceStage()}>
                    Continue to application
                  </Button>
                </>
              ) : (
              <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Amount (INR)</Label>
                  <Input
                    value={stageData.token?.amount ?? String(booking.booking_amount ?? '')}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        token: { ...d.token, amount: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={stageData.token?.date ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        token: { ...d.token, date: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Payment mode</Label>
                  <Input
                    value={stageData.token?.mode ?? booking.payment_mode ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        token: { ...d.token, mode: e.target.value }
                      }))
                    }
                  />
                </div>
              </div>
              <Button
                disabled={saving}
                onClick={() =>
                  void saveStagePatch({
                    amount: stageData.token?.amount,
                    date: stageData.token?.date,
                    mode: stageData.token?.mode ?? booking.payment_mode
                  })
                }
              >
                Save token
              </Button>
              </>
              )}
            </Card>
          ) : null}

          {workflowStage === 'application' && !cancelled ? (
            <Card className="space-y-4 p-4">
              <h2 className="font-semibold text-ds-gray-900">Application form</h2>
              <p className="text-sm text-ds-gray-600">
                PAN and Aadhaar are loaded from each customer&apos;s profile (complete KYC on
                Customers first). Upload documents here; generate the printable application form
                from{' '}
                <Link
                  className="font-medium text-ds-primary-600 underline-offset-2 hover:underline"
                  href={`/crm/documents/${encodeURIComponent(booking.id)}`}
                >
                  Agreements &amp; documents
                </Link>
                .
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Occupation</Label>
                  <Input
                    value={stageData.application?.occupation ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        application: { ...d.application, occupation: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={stageData.application?.address_line1 ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        application: { ...d.application, address_line1: e.target.value }
                      }))
                    }
                  />
                </div>
              </div>

              {buyerKyc.map((b) => (
                <div
                  key={b.customerId}
                  className="rounded-lg border border-ds-gray-200 p-3 space-y-2"
                >
                  <p className="text-sm font-semibold text-ds-gray-800">{b.label}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">PAN</Label>
                      <Input
                        value={b.pan}
                        onChange={(e) =>
                          setBuyerKyc((rows) =>
                            rows.map((r) =>
                              r.customerId === b.customerId
                                ? { ...r, pan: e.target.value.toUpperCase() }
                                : r
                            )
                          )
                        }
                        placeholder="ABCDE1234F"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Aadhaar (last 4)</Label>
                      <Input
                        value={b.aadhaarLast4}
                        maxLength={4}
                        onChange={(e) =>
                          setBuyerKyc((rows) =>
                            rows.map((r) =>
                              r.customerId === b.customerId
                                ? {
                                  ...r,
                                  aadhaarLast4: e.target.value.replace(/\D/g, '').slice(0, 4)
                                }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-ds-gray-500">
                    Docs: PAN {b.hasPanDoc ? '✓' : '—'} · Aadhaar {b.hasAadhaarDoc ? '✓' : '—'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void saveBuyerIdentifiers(b)}
                      disabled={saving}
                    >
                      Save IDs
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        setKycUploadCustomerId(b.customerId);
                        setKycDocType('pan');
                        kycFileRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload PAN
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        setKycUploadCustomerId(b.customerId);
                        setKycDocType('aadhaar');
                        kycFileRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload Aadhaar
                    </Button>
                  </div>
                </div>
              ))}
              <input
                ref={kycFileRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={() => void uploadKyc()}
              />

              {!kycComplete ? (
                <div className="space-y-2">
                  <p className="text-sm text-ds-warning-800">
                    Application form data is filled from each customer&apos;s profile after KYC
                    is complete. Finish KYC on Customers, then generate the printable form here.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {buyersNeedingKyc.map((b) => (
                      <Button
                        key={b.customerId}
                        type="button"
                        variant="outline"
                        className="gap-1"
                        asChild
                      >
                        <Link
                          href={`/crm/customers?customer=${encodeURIComponent(b.customerId)}&tab=kyc`}
                        >
                          <FileText className="h-4 w-4" />
                          Complete KYC — {b.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  asChild
                >
                  <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                    <FileText className="h-4 w-4" />
                    Agreements &amp; documents
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() =>
                    void saveStagePatch({
                      occupation: stageData.application?.occupation,
                      address_line1: stageData.application?.address_line1,
                      submitted_at: new Date().toISOString().slice(0, 10)
                    })
                  }
                >
                  Mark application submitted
                </Button>
              </div>
            </Card>
          ) : null}

          {workflowStage === 'allotment' && !cancelled ? (
            <Card className="space-y-4 p-4">
              <h2 className="font-semibold text-ds-gray-900">Allotment</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Allotment date</Label>
                  <Input
                    type="date"
                    value={stageData.allotment?.allotment_date ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        allotment: { ...d.allotment, allotment_date: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Letter reference</Label>
                  <Input
                    value={stageData.allotment?.allotment_letter_ref ?? ''}
                    onChange={(e) =>
                      setStageData((d) => ({
                        ...d,
                        allotment: { ...d.allotment, allotment_letter_ref: e.target.value }
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="gap-1" asChild>
                  <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                    <FileText className="h-4 w-4" />
                    Allotment letter &amp; PDFs
                  </Link>
                </Button>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void saveStagePatch({
                      allotment_date: stageData.allotment?.allotment_date,
                      allotment_letter_ref: stageData.allotment?.allotment_letter_ref
                    })
                  }
                >
                  Save allotment
                </Button>
              </div>
            </Card>
          ) : null}

          {workflowStage === 'confirmation' || cancelled ? (
            <Card className="space-y-4 p-4">
              <div>
                <h2 className="font-semibold text-ds-gray-900">
                  {cancelled ? 'Booking cancelled' : 'Booking confirmed'}
                </h2>
                <p className="mt-1 text-sm text-ds-gray-600">
                  {cancelled
                    ? 'Unit released to inventory. Refund details shown above if applicable.'
                    : 'Payment schedule was generated from this project’s CLD configuration at confirmation.'}
                </p>
              </div>
              {!cancelled ? (
                <div>
                  <div className="text-sm font-semibold text-ds-gray-900">
                    Payment schedule
                  </div>
                  <p className="mt-1 text-xs text-ds-gray-500">
                    Configure stages under CLD if milestones or demand splits need
                    to change for future bookings.
                  </p>
                  <div className="mt-3">
                    <PaymentScheduleTable
                      rows={paymentSchedules}
                      receivedBySchedule={scheduleReceivedById}
                      loading={loadingSchedule}
                      compact
                    />
                  </div>
                </div>
              ) : null}
              {!cancelled && unit ? (
                <div className="rounded-lg border border-ds-gray-200 bg-ds-gray-50/40 p-3">
                  <div className="text-sm font-semibold text-ds-gray-900">
                    Booked unit
                  </div>
                  <p className="mt-1 text-xs text-ds-gray-500">
                    Inventory locked to this booking at confirmation.
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
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
                        <tr className="border-b border-ds-gray-100 text-ds-gray-800">
                          <td className="py-2 pr-3 font-medium tabular-nums">
                            {unit.unit_code}
                          </td>
                          <td className="py-2 pr-3">{unit.wing_name ?? '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {unit.floor ?? '—'}
                          </td>
                          <td className="py-2 pr-3">{unit.unit_type ?? '—'}</td>
                          <td className="py-2">{unit.status ?? '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {!cancelled ? (
                <>
                  <div className="space-y-3 border-t border-ds-gray-200 pt-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ds-gray-900">Booking documents</h3>
                      <p className="mt-1 text-xs text-ds-gray-500">
                        Generate and store each document, download from the table, and notify the
                        buyer (email when Resend is configured; WhatsApp opens with a prefilled
                        message for you to send).
                      </p>
                    </div>
                    {docDeliveryBanner ? (
                      <div className="rounded-lg border border-ds-primary-200 bg-ds-primary-50/70 px-3 py-2 text-sm text-ds-primary-900">
                        {docDeliveryBanner}
                      </div>
                    ) : null}
                    {confirmationDocsLoading ? (
                      <p className="text-sm text-ds-gray-500">Loading document tools…</p>
                    ) : confirmationPrintPack ? (
                      <BookingDocumentsMatrixTable
                        rows={confirmationMatrixRows}
                        kycComplete={confirmationPrintPack.kycComplete}
                        generatingKind={generatingDocKind}
                        onGenerate={handleConfirmationDocGenerate}
                      />
                    ) : (
                      <p className="text-sm text-ds-warning-800">
                        Could not load document data. Open{' '}
                        <Link
                          className="font-medium text-ds-primary-600 underline-offset-2 hover:underline"
                          href={`/crm/documents/${encodeURIComponent(booking.id)}`}
                        >
                          Agreements &amp; documents
                        </Link>{' '}
                        for the full page.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-1" asChild>
                      <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                        <FileText className="h-4 w-4" />
                        Agreements &amp; documents
                      </Link>
                    </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/crm/financials/${bookingId}`}>
                      Manage collections
                    </Link>
                  </Button>
                  {booking?.project_id ? (
                    <Button variant="outline" asChild>
                      <Link href={`/crm/project/${booking.project_id}/cld`}>
                        Project CLD
                      </Link>
                    </Button>
                  ) : null}
                </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link href={`/crm/financials/${bookingId}`}>
                      Manage collections
                    </Link>
                  </Button>
                  {booking?.project_id ? (
                    <Button variant="outline" asChild>
                      <Link href={`/crm/project/${booking.project_id}/cld`}>
                        Project CLD
                      </Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </Card>
          ) : null}

          {!cancelled && workflowStage !== 'confirmation' ? (
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                variant="outline"
                className="text-ds-error-700 border-ds-error-200"
                onClick={() => setCancelOpen(true)}
              >
                Cancel booking
              </Button>
              <Button onClick={() => void advanceStage()} disabled={saving}>
                {saving
                  ? 'Saving…'
                  : workflowStage === 'allotment'
                    ? 'Confirm booking'
                    : 'Continue to next step'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
            <DialogDescription>
              Unit will be released. Refund is calculated from recorded collections (10%
              retention by default).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'Buyer request',
                    'Loan not sanctioned',
                    'Duplicate booking',
                    'Project delay',
                    'Other'
                  ].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={saving || !cancelReason}
              onClick={() => void submitCancellation()}
            >
              Confirm cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
