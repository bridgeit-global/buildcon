'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Upload } from 'lucide-react';
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
import { canAdvanceWorkflowStage } from '../booking-stage-transitions';

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
  const kycFileRef = useRef<HTMLInputElement>(null);
  const [kycUploadCustomerId, setKycUploadCustomerId] = useState('');
  const [kycDocType, setKycDocType] = useState('pan');

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
        customers ( full_name, phone, pan_number, aadhaar_last4 )
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
    setStageData((row.stage_data ?? {}) as BookingStageData);

    const primary = unwrapJoin(row.customers);
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

    const { data: custRows } = await supabase
      .from('customers')
      .select('id,pan_number,aadhaar_last4')
      .in(
        'id',
        buyerIds.map((b) => b.id)
      );

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
          pan: String(c?.pan_number ?? ''),
          aadhaarLast4: String(c?.aadhaar_last4 ?? ''),
          hasPanDoc: docs.has('pan'),
          hasAadhaarDoc: docs.has('aadhaar')
        };
      })
    );
    setLoading(false);
  }, [bookingId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const workflowStage = (booking?.workflow_stage ?? 'token') as BookingWorkflowStage;
  const cancelled = booking?.status === 'cancelled';
  const stepIndex = BOOKING_WORKFLOW_STAGES.indexOf(workflowStage);

  const kycComplete = useMemo(
    () =>
      buyerKyc.every(
        (b) =>
          b.pan.trim().length >= 4 &&
          b.aadhaarLast4.replace(/\D/g, '').length === 4 &&
          b.hasPanDoc &&
          b.hasAadhaarDoc
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
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-12 md:p-6">
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
            </Card>
          ) : null}

          {workflowStage === 'application' && !cancelled ? (
            <Card className="space-y-4 p-4">
              <h2 className="font-semibold text-ds-gray-900">Application form</h2>
              <p className="text-sm text-ds-gray-600">
                Capture buyer details, PAN / Aadhaar, and KYC documents for each applicant.
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

              <div className="flex flex-wrap gap-2">
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
            </Card>
          ) : null}

          {workflowStage === 'confirmation' || cancelled ? (
            <Card className="p-4">
              <h2 className="font-semibold text-ds-gray-900">
                {cancelled ? 'Booking cancelled' : 'Booking confirmed'}
              </h2>
              <p className="mt-1 text-sm text-ds-gray-600">
                {cancelled
                  ? 'Unit released to inventory. Refund details shown above if applicable.'
                  : 'Payment schedule created. Manage collections from Financials.'}
              </p>
              <Button className="mt-3" variant="outline" asChild>
                <Link href="/crm/financials">Open financials</Link>
              </Button>
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
