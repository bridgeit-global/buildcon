'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, FileText, Loader2, Upload } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { CrmDetailPageSkeleton } from '../../_components/crm-skeletons';
import { Button } from '@/components/ui/button';
import { TextInputField } from '@/components/ui/text-input-field';
import { Input } from '@/components/ui/input';
import { InrAmountInput } from '@/components/ui/inr-amount-input';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/ui/field-label';
import { PhoneInputField } from '@/components/ui/phone-input-field';
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
import { isIsoDateNotAfterToday, todayIsoDate } from '@/lib/date-input-value';
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
import {
  isCustomerKycComplete,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';
import { PaymentScheduleTable } from '../../financials/payment-schedule-table';
import {
  loadBookingPrintPack,
  type BookingPrintPack
} from '@/lib/booking/load-booking-print-pack';
import { generateAndNotifyBookingDocument } from '@/lib/booking/generate-and-notify-booking-document';
import {
  notifyGeneratedBookingDocument,
  toastDocumentDeliveryResults
} from '@/lib/booking/notify-booking-document';
import { formatDisplayDate } from '@/lib/format-display-date';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { GENERATED_DOCUMENTS_LIST_SELECT } from '@/lib/crm/generated-documents-select';
import {
  BookingDocumentsMatrixTable,
  buildMatrixRows
} from '@/app/crm/documents/booking-documents-matrix-table';
import { BookingNotificationsCard } from '@/app/crm/bookings/booking-notifications-card';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextareaField } from '@/components/ui/textarea-field';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import { EmailInputField } from '@/components/ui/email-input-field';
import {
  bookingAllotmentSchema,
  bookingCancelSchema,
  createBookingTokenStageSchema,
  parseBookingBuyerAadhaarInlineError,
  parseBookingBuyerKycFieldErrors,
  parseBookingBuyerPanInlineError
} from '@/lib/booking/booking-workflow.schema';
import { kycUploadSchema } from '@/lib/customer/customer-forms.schema';
import {
  isKycFileAllowed,
  kycFileAcceptForDocType,
  kycFileRejectMessage
} from '@/lib/customer/kyc-file';
import {
  GeneratedDocumentsTable,
  type GeneratedDocRow
} from '@/app/crm/documents/generated-documents-table';
import { BookingAddressFields } from '../booking-address-fields';
import { PdfViewerDialog } from '@/components/pdf-viewer-dialog';
import { ImageViewerDialog } from '@/components/image-viewer-dialog';
import { isUnitPossessedStatus } from '@/app/crm/inventory/unit-status';
import BackButton from '@/components/buttons/back-button';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import { resolveSortFromState, sortRowsByState } from '@/lib/crm/list-sort';
import { BOOKING_PAYMENT_MODE_OPTIONS } from '@/lib/booking/booking-payment';

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

type BuyerAddress = {
  id: string;
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

type BuyerKyc = {
  customerId: string;
  label: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  dob: string | null;
  nationality: string | null;
  guardian_name: string | null;
  residential_status: string | null;
  passport_number: string | null;
  office_name_address: string | null;
  pan: string;
  aadhaarLast4: string;
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
  hasPhotoDoc: boolean;
  panDocPath: string | null;
  aadhaarDocPath: string | null;
  photoDocPath: string | null;
  permanentAddress: BuyerAddress | null;
  communicationAddress: BuyerAddress | null;
};

export default function BookingDetailPage() {
  const params = useParams();
  const bookingId = String(params.id ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<BookingDetailRow | null>(null);
  const [stageData, setStageData] = useState<BookingStageData>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelSubmitAttempted, setCancelSubmitAttempted] = useState(false);
  const [allotmentDateTouched, setAllotmentDateTouched] = useState(false);
  const [refundPreview, setRefundPreview] = useState<{
    refund_amount: number;
    deduction_amount: number;
    total_collected: number;
    policy_notes: string;
  } | null>(null);

  const [inquiryInfo, setInquiryInfo] = useState<{
    lead_source: string | null;
    broker_name: string | null;
    broker_rera: string | null;
  } | null>(null);
  const [buyerKyc, setBuyerKyc] = useState<BuyerKyc[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectLocation, setProjectLocation] = useState<string | null>(null);
  const kycFileRef = useRef<HTMLInputElement>(null);
  const prefilledBuyerFields = useRef<Record<string, Set<string>>>({});
  const [kycUploadCustomerId, setKycUploadCustomerId] = useState('');
  const [kycDocType, setKycDocType] = useState('pan');
  const [uploadingKycKey, setUploadingKycKey] = useState<string | null>(null);
  const [buyerKycFieldErrors, setBuyerKycFieldErrors] = useState<
    Record<string, { pan?: string; aadhaar?: string }>
  >({});
  const [appFormFieldErrors, setAppFormFieldErrors] = useState<
    Record<string, Record<string, string>>
  >({});
  const [savingBuyerAppForm, setSavingBuyerAppForm] = useState<string | null>(null);
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
  const [bookingCollections, setBookingCollections] = useState<
    { id: string; schedule_id: string | null }[]
  >([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [confirmationPrintPack, setConfirmationPrintPack] = useState<BookingPrintPack | null>(
    null
  );
  const [confirmationDocsLoading, setConfirmationDocsLoading] = useState(false);
  const [confirmationGenerated, setConfirmationGenerated] = useState<GeneratedDocRow[]>([]);
  const {
    sorting: confirmationGeneratedSorting,
    onSortingChange: onConfirmationGeneratedSortingChange
  } = useServerListSorting([{ id: 'generated_at', desc: true }]);
  const {
    sorting: confirmationMatrixSorting,
    onSortingChange: onConfirmationMatrixSortingChange
  } = useServerListSorting();
  const [generatingDocKind, setGeneratingDocKind] = useState<BookingDocumentPrintKind | null>(null);
  const [confirmationDocsLoadingGenerated, setConfirmationDocsLoadingGenerated] =
    useState(false);
  const [generatingApplicationForm, setGeneratingApplicationForm] = useState(false);
  const [viewingApplicationForm, setViewingApplicationForm] = useState(false);
  const [applicationFormExists, setApplicationFormExists] = useState(false);
  const [appFormPreviewOpen, setAppFormPreviewOpen] = useState(false);
  const [appFormPreviewUrl, setAppFormPreviewUrl] = useState('');
  const [generatingAllotmentLetter, setGeneratingAllotmentLetter] = useState(false);
  const [viewingAllotmentLetter, setViewingAllotmentLetter] = useState(false);
  const [allotmentLetterExists, setAllotmentLetterExists] = useState(false);
  const [allotmentLetterPreviewOpen, setAllotmentLetterPreviewOpen] = useState(false);
  const [allotmentLetterPreviewUrl, setAllotmentLetterPreviewUrl] = useState('');
  const [kycPreviewOpen, setKycPreviewOpen] = useState(false);
  const [kycPreviewUrl, setKycPreviewUrl] = useState('');
  const [kycPreviewTitle, setKycPreviewTitle] = useState('');
  const [kycPreviewIsImage, setKycPreviewIsImage] = useState(false);
  const [kycPreviewLoading, setKycPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from('bookings')
      .select(
        `
        id, project_id, unit_id, customer_id, sales_inquiry_id,
        created_at, updated_at, stage, workflow_stage, status,
        payment_mode, loan_bank, booking_amount, co_buyers, payment_detail, stage_data,
        units ( unit_code, wing_name, floor, unit_type, status ),
        customers ( full_name, phone, email, occupation, pan_number, aadhaar_last4 ),
        sales_inquiries ( lead_source, brokers ( full_name, license_no ) )
      `
      )
      .eq('id', bookingId)
      .maybeSingle();

    if (qErr) {
      pageError(qErr.message);
      setLoading(false);
      return;
    }
    if (!data) {
      pageError('Booking not found');
      setLoading(false);
      return;
    }

    const row = data as unknown as BookingDetailRow & {
      sales_inquiries?: {
        lead_source: string | null;
        brokers: { full_name: string; license_no: string | null } | { full_name: string; license_no: string | null }[] | null;
      } | { lead_source: string | null; brokers: { full_name: string; license_no: string | null } | { full_name: string; license_no: string | null }[] | null }[] | null;
    };
    setBooking(row);

    const inq = unwrapJoin(row.sales_inquiries ?? null);
    if (inq) {
      const broker = unwrapJoin(inq.brokers ?? null);
      setInquiryInfo({
        lead_source: inq.lead_source,
        broker_name: broker?.full_name ?? null,
        broker_rera: broker?.license_no ?? null
      });
    }

    const stage = (row.stage_data ?? {}) as BookingStageData;
    const primary = unwrapJoin(row.customers);

    const [{ data: projectRow }] = await Promise.all([
      supabase
        .from('projects')
        .select('name, location')
        .eq('id', row.project_id)
        .maybeSingle()
    ]);
    setProjectName((projectRow?.name as string) ?? null);
    setProjectLocation((projectRow?.location as string) ?? null);

    const app = stage.application ?? {};
    setStageData({
      ...stage,
      application: {
        ...app,
        occupation: app.occupation || primary?.occupation || undefined
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
      .select('customer_id,doc_type,storage_path')
      .in(
        'customer_id',
        buyerIds.map((b) => b.id)
      );

    const buyerIdList = buyerIds.map((b) => b.id);

    const [{ data: custRows }, { data: allAddrRows }] = await Promise.all([
      supabase
        .from('customers')
        .select(
          'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address'
        )
        .in('id', buyerIdList),
      supabase
        .from('customer_addresses')
        .select('id,customer_id,kind,address_line1,city,state,pin')
        .in('customer_id', buyerIdList)
        .order('created_at', { ascending: true })
    ]);

    const custById = new Map((custRows ?? []).map((c) => [c.id as string, c]));
    const addrByCustomer = new Map<string, Array<BuyerAddress & { customer_id: string }>>();
    for (const a of (allAddrRows ?? []) as Array<BuyerAddress & { customer_id: string }>) {
      const cid = a.customer_id as string;
      if (!addrByCustomer.has(cid)) addrByCustomer.set(cid, []);
      addrByCustomer.get(cid)!.push(a);
    }

    const docsByCustomer = new Map<string, Set<string>>();
    const docPathsByCustomer = new Map<string, Record<string, string>>();
    for (const doc of kycRows ?? []) {
      const cid = doc.customer_id as string;
      if (!docsByCustomer.has(cid)) docsByCustomer.set(cid, new Set());
      docsByCustomer.get(cid)!.add(String(doc.doc_type));
      if (doc.storage_path) {
        if (!docPathsByCustomer.has(cid)) docPathsByCustomer.set(cid, {});
        docPathsByCustomer.get(cid)![String(doc.doc_type)] = String(doc.storage_path);
      }
    }

    const nextBuyerKyc = buyerIds.map((b) => {
      const c = custById.get(b.id);
      const docs = docsByCustomer.get(b.id) ?? new Set();
      const paths = docPathsByCustomer.get(b.id) ?? {};
      const addrs = addrByCustomer.get(b.id) ?? [];
      const permAddr = addrs.find((a) => a.kind === 'permanent') ?? null;
      const commAddr = addrs.find((a) => a.kind === 'current') ?? addrs[0] ?? null;
      return {
        customerId: b.id,
        label: b.label,
        fullName: String(c?.full_name ?? b.label),
        phone: (c?.phone as string | null) ?? null,
        email: (c?.email as string | null) ?? null,
        occupation: (c?.occupation as string | null) ?? null,
        dob: (c?.dob as string | null) ?? null,
        nationality: (c?.nationality as string | null) ?? null,
        guardian_name: (c?.guardian_name as string | null) ?? null,
        residential_status: (c?.residential_status as string | null) ?? null,
        passport_number: (c?.passport_number as string | null) ?? null,
        office_name_address: (c?.office_name_address as string | null) ?? null,
        pan: String(c?.pan_number ?? ''),
        aadhaarLast4: String(c?.aadhaar_last4 ?? ''),
        hasPanDoc: docs.has('pan'),
        hasAadhaarDoc: docs.has('aadhaar'),
        hasPhotoDoc: docs.has('photo'),
        panDocPath: paths['pan'] ?? null,
        aadhaarDocPath: paths['aadhaar'] ?? null,
        photoDocPath: paths['photo'] ?? null,
        permanentAddress: permAddr ? { id: permAddr.id, kind: permAddr.kind, address_line1: permAddr.address_line1, city: permAddr.city, state: permAddr.state, pin: permAddr.pin } : null,
        communicationAddress: commAddr ? { id: commAddr.id, kind: commAddr.kind, address_line1: commAddr.address_line1, city: commAddr.city, state: commAddr.state, pin: commAddr.pin } : null
      };
    });
    const prefilled: Record<string, Set<string>> = {};
    for (const nb of nextBuyerKyc) {
      const fields = new Set<string>();
      if (nb.fullName) fields.add('fullName');
      if (nb.guardian_name) fields.add('guardian_name');
      if (nb.dob) fields.add('dob');
      if (nb.pan) fields.add('pan');
      if (nb.aadhaarLast4) fields.add('aadhaarLast4');
      if (nb.nationality) fields.add('nationality');
      if (nb.residential_status) fields.add('residential_status');
      if (nb.occupation) fields.add('occupation');
      if (nb.passport_number) fields.add('passport_number');
      if (nb.phone) fields.add('phone');
      if (nb.email) fields.add('email');
      if (nb.permanentAddress?.address_line1) fields.add('permanentAddress');
      if (nb.communicationAddress?.address_line1) fields.add('communicationAddress');
      if (nb.office_name_address) fields.add('office_name_address');
      prefilled[nb.customerId] = fields;
    }
    prefilledBuyerFields.current = prefilled;

    setBuyerKyc(nextBuyerKyc);
    setBuyerKycFieldErrors({});
    setLoading(false);
  }, [bookingId, supabase]);

  const loadPaymentSchedule = useCallback(async () => {
    if (!bookingId) return;
    setLoadingSchedule(true);
    const [{ data: sData, error: sErr }, { data: cData, error: cErr }] =
      await Promise.all([
        supabase
          .from('payment_schedules')
          .select('id,instalment_no,milestone,due_date,amount')
          .eq('booking_id', bookingId)
          .order('instalment_no', { ascending: true }),
        supabase
          .from('collections')
          .select('id,schedule_id,received_amount')
          .eq('booking_id', bookingId)
      ]);
    if (!sErr) setPaymentSchedules((sData ?? []) as typeof paymentSchedules);
    if (!cErr) {
      const map: Record<string, number> = {};
      const collRows: { id: string; schedule_id: string | null }[] = [];
      for (const c of cData ?? []) {
        collRows.push({
          id: c.id as string,
          schedule_id: c.schedule_id as string | null
        });
        const sid = c.schedule_id as string | null;
        if (!sid) continue;
        map[sid] = (map[sid] || 0) + Number(c.received_amount || 0);
      }
      setBookingCollections(collRows);
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

  const allotmentDateError = useMemo(() => {
    if (!allotmentDateTouched) return undefined;
    const parsed = bookingAllotmentSchema.safeParse({
      allotment_date: String(stageData.allotment?.allotment_date ?? '')
    });
    return parsed.success ? undefined : parsed.error.issues[0]?.message;
  }, [allotmentDateTouched, stageData.allotment?.allotment_date]);

  const cancelReasonError = useMemo(() => {
    if (!cancelSubmitAttempted) return undefined;
    const parsed = bookingCancelSchema.safeParse({ cancelReason });
    return parsed.success ? undefined : parsed.error.issues[0]?.message;
  }, [cancelSubmitAttempted, cancelReason]);

  const refreshConfirmationGenerated = useCallback(async () => {
    if (!bookingId) return;
    setConfirmationDocsLoadingGenerated(true);
    const GENERATED_SORT: Record<string, string> = {
      generated_at: 'generated_at',
      storage_path: 'storage_path'
    };
    const { column, ascending } = resolveSortFromState(
      confirmationGeneratedSorting,
      GENERATED_SORT,
      'generated_at',
      false
    );
    const { data, error: gErr } = await supabase
      .from('generated_documents')
      .select(GENERATED_DOCUMENTS_LIST_SELECT)
      .eq('booking_id', bookingId)
      .order(column, { ascending })
      .limit(200);
    if (gErr) {
      pageError(gErr.message);
    } else {
      setConfirmationGenerated((data ?? []) as GeneratedDocRow[]);
    }
    setConfirmationDocsLoadingGenerated(false);
  }, [bookingId, confirmationGeneratedSorting, supabase]);

  useEffect(() => {
    if (!bookingId || workflowStage !== 'confirmation' || cancelled) {
      setConfirmationPrintPack(null);
      setConfirmationGenerated([]);
      setConfirmationDocsLoading(false);
      return;
    }
    let ignore = false;
    (async () => {
      setConfirmationDocsLoading(true);
      const { column, ascending } = resolveSortFromState(
        confirmationGeneratedSorting,
        { generated_at: 'generated_at', storage_path: 'storage_path' },
        'generated_at',
        false
      );
      const [packRes, genRes] = await Promise.all([
        loadBookingPrintPack(supabase, bookingId),
        supabase
          .from('generated_documents')
          .select(GENERATED_DOCUMENTS_LIST_SELECT)
          .eq('booking_id', bookingId)
          .order(column, { ascending })
          .limit(200)
      ]);
      if (ignore) return;
      if (packRes.ok) setConfirmationPrintPack(packRes.pack);
      else setConfirmationPrintPack(null);
      if (genRes.error) pageError(genRes.error.message);
      else setConfirmationGenerated((genRes.data ?? []) as GeneratedDocRow[]);
      setConfirmationDocsLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [bookingId, workflowStage, cancelled, confirmationGeneratedSorting, supabase]);

  useEffect(() => {
    if (!bookingId || workflowStage !== 'application' || cancelled) {
      setApplicationFormExists(false);
      return;
    }
    let ignore = false;
    (async () => {
      const { count } = await supabase
        .from('generated_documents')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId)
        .like('storage_path', '%application-form%');
      if (!ignore) setApplicationFormExists((count ?? 0) > 0);
    })();
    return () => { ignore = true; };
  }, [bookingId, workflowStage, cancelled, supabase]);

  useEffect(() => {
    if (!bookingId || workflowStage !== 'allotment' || cancelled) {
      setAllotmentLetterExists(false);
      return;
    }
    let ignore = false;
    (async () => {
      const { count } = await supabase
        .from('generated_documents')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId)
        .like('storage_path', '%allotment-letter%');
      if (!ignore) setAllotmentLetterExists((count ?? 0) > 0);
    })();
    return () => { ignore = true; };
  }, [bookingId, workflowStage, cancelled, supabase]);

  const scheduleLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of paymentSchedules) {
      m.set(s.id, `${s.instalment_no}. ${s.milestone}`);
    }
    for (const c of bookingCollections) {
      if (c.schedule_id && m.has(c.schedule_id)) {
        m.set(c.id, m.get(c.schedule_id)!);
      } else if (!c.schedule_id) {
        m.set(c.id, 'Unassigned receipt');
      }
    }
    return m;
  }, [paymentSchedules, bookingCollections]);

  const confirmationMatrixRows = useMemo(() => {
    const built = buildMatrixRows(confirmationGenerated);
    return sortRowsByState(built, confirmationMatrixSorting, (row, colId) => {
      if (colId === 'document') return row.label;
      if (colId === 'status') return row.latest?.generated_at ?? '';
      return null;
    });
  }, [confirmationGenerated, confirmationMatrixSorting]);

  const outstandingTotal = useMemo(() => {
    if (paymentSchedules.length === 0) return null;
    let total = 0;
    for (const s of paymentSchedules) {
      const received = scheduleReceivedById[s.id] ?? 0;
      total += Math.max(0, Number(s.amount ?? 0) - Number(received));
    }
    return total;
  }, [paymentSchedules, scheduleReceivedById]);

  const handleConfirmationDocGenerate = useCallback(
    async (kind: BookingDocumentPrintKind) => {
      if (!confirmationPrintPack) return;
      setGeneratingDocKind(kind);
      try {
        const r = await generateAndNotifyBookingDocument({
          supabase,
          bookingId: confirmationPrintPack.booking.id,
          pack: confirmationPrintPack,
          kind
        });
        if (!r.ok) {
          pageError(r.error);
          return;
        }
        toast.success('Document generated. Review it, then click Send to notify the customer.');
        await refreshConfirmationGenerated();
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Generate failed');
      } finally {
        setGeneratingDocKind(null);
      }
    },
    [confirmationPrintPack, supabase, refreshConfirmationGenerated]
  );

  const handleConfirmationDocNotify = useCallback(
    async (generatedDocumentId: string) => {
      if (!bookingId) return;
      try {
        const r = await notifyGeneratedBookingDocument(bookingId, generatedDocumentId);
        if (!r.ok) {
          pageError(r.error ?? 'Notification failed');
          return;
        }
        toastDocumentDeliveryResults(r, { lead: 'Notification sent.' });
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Send failed');
      }
    },
    [bookingId]
  );

  const handleGenerateApplicationForm = useCallback(async () => {
    if (!booking) return;
    setGeneratingApplicationForm(true);
    try {
      const packRes = await loadBookingPrintPack(supabase, bookingId);
      if (!packRes.ok) {
        pageError(packRes.error);
        return;
      }
      const pack = packRes.pack;

      const r = await generateAndNotifyBookingDocument({
        supabase,
        bookingId: pack.booking.id,
        pack,
        kind: 'application-form'
      });
      if (!r.ok) {
        pageError(r.error);
        return;
      }

      setApplicationFormExists(true);
      toast.success('Application form generated successfully.');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setGeneratingApplicationForm(false);
    }
  }, [booking, bookingId, supabase]);

  const handleViewApplicationForm = useCallback(async () => {
    if (!bookingId) return;
    setViewingApplicationForm(true);
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('storage_path')
        .eq('booking_id', bookingId)
        .like('storage_path', '%application-form%')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
      if (error || !data?.storage_path) {
        pageError('No application form found. Please generate one first.');
        return;
      }
      const bucket = data.storage_path.startsWith('documents/') ? 'documents' : 'kyc';
      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.storage_path, 3600);
      if (urlErr || !urlData?.signedUrl) {
        pageError('Could not load application form preview.');
        return;
      }
      setAppFormPreviewUrl(urlData.signedUrl);
      setAppFormPreviewOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load application form');
    } finally {
      setViewingApplicationForm(false);
    }
  }, [bookingId, supabase]);

  const handleGenerateAllotmentLetter = useCallback(async () => {
    if (!booking) return;
    const alParsed = bookingAllotmentSchema.safeParse({
      allotment_date: String(stageData.allotment?.allotment_date ?? '')
    });
    if (!alParsed.success) {
      pageError(alParsed.error.issues[0]?.message ?? 'Enter allotment date before generating.');
      return;
    }
    setGeneratingAllotmentLetter(true);
    try {
      const saveRes = await fetch(`/api/crm/bookings/${booking.id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          stageDataPatch: {
            allotment_date: stageData.allotment?.allotment_date
          }
        })
      });
      if (!saveRes.ok) {
        const sj = (await saveRes.json()) as { error?: string };
        pageError(sj.error || 'Could not save allotment details before generating.');
        return;
      }

      const packRes = await loadBookingPrintPack(supabase, bookingId);
      if (!packRes.ok) {
        pageError(packRes.error);
        return;
      }
      const pack = packRes.pack;

      const r = await generateAndNotifyBookingDocument({
        supabase,
        bookingId: pack.booking.id,
        pack,
        kind: 'allotment-letter'
      });
      if (!r.ok) {
        pageError(r.error);
        return;
      }

      setAllotmentLetterExists(true);
      toast.success('Allotment letter generated successfully.');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setGeneratingAllotmentLetter(false);
    }
  }, [booking, bookingId, stageData.allotment, supabase]);

  const handleViewAllotmentLetter = useCallback(async () => {
    if (!bookingId) return;
    setViewingAllotmentLetter(true);
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('storage_path')
        .eq('booking_id', bookingId)
        .like('storage_path', '%allotment-letter%')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
      if (error || !data?.storage_path) {
        pageError('No allotment letter found. Please generate one first.');
        return;
      }
      const bucket = data.storage_path.startsWith('documents/') ? 'documents' : 'kyc';
      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.storage_path, 3600);
      if (urlErr || !urlData?.signedUrl) {
        pageError('Could not load allotment letter preview.');
        return;
      }
      setAllotmentLetterPreviewUrl(urlData.signedUrl);
      setAllotmentLetterPreviewOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to load allotment letter');
    } finally {
      setViewingAllotmentLetter(false);
    }
  }, [bookingId, supabase]);

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
          ...(b.hasAadhaarDoc ? ['aadhaar'] : []),
          ...(b.hasPhotoDoc ? ['photo'] : [])
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
            ...(b.hasAadhaarDoc ? ['aadhaar'] : []),
            ...(b.hasPhotoDoc ? ['photo'] : [])
          ])
      ),
    [buyerKyc]
  );

  const allBuyerAppFormsValid = useMemo(
    () =>
      buyerKyc.length > 0 &&
      buyerKyc.every((b) => Object.keys(validateBuyerAppFormFields(b)).length === 0),
    [buyerKyc]
  );

  async function saveStagePatch(patch: Record<string, unknown>) {
    if (!booking || cancelled) return;
    if (workflowStage === 'token') {
      const tokenParsed = createBookingTokenStageSchema({
        loanBank: booking.loan_bank
      }).safeParse({
        amount: String(patch.amount ?? ''),
        date: String(patch.date ?? ''),
        mode: String(patch.mode ?? '')
      });
      if (!tokenParsed.success) {
        pageError(tokenParsed.error.issues[0]?.message ?? 'Complete token details.');
        return;
      }
    }
    setSaving(true);
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
      pageError(e instanceof Error ? e.message : 'Save failed');
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
        allotment_date: stageData.allotment?.allotment_date
      };
    }
    return {};
  }

  async function advanceStage() {
    if (!booking || cancelled) return;
    const patch = stagePatchForAdvance();
    if (workflowStage === 'token') {
      const tokenParsed = createBookingTokenStageSchema({
        loanBank: booking.loan_bank
      }).safeParse({
        amount: String(patch.amount ?? ''),
        date: String(patch.date ?? ''),
        mode: String(patch.mode ?? '')
      });
      if (!tokenParsed.success) {
        pageError(tokenParsed.error.issues[0]?.message ?? 'Complete token details.');
        return;
      }
    }
    if (workflowStage === 'application') {
      if (!validateAllBuyerAppForms()) {
        pageError('Complete all required applicant details before continuing.');
        return;
      }
      if (!validateAllBuyerKyc()) {
        pageError('Enter valid PAN and Aadhaar for each applicant before continuing.');
        return;
      }
    }
    if (workflowStage === 'allotment') {
      const alParsed = bookingAllotmentSchema.safeParse({
        allotment_date: String(patch.allotment_date ?? '')
      });
      if (!alParsed.success) {
        pageError(alParsed.error.issues[0]?.message ?? 'Enter allotment date.');
        return;
      }
    }
    const merged = { ...stageData, [workflowStage]: { ...stageData[workflowStage], ...patch } };
    const check = canAdvanceWorkflowStage(workflowStage, merged, { kycComplete });
    if (!check.ok) {
      pageError(check.reason ?? 'Cannot advance');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          stageDataPatch: stagePatchForAdvance()
        })
      });
      const json = (await res.json()) as {
        error?: string;
        workflowStage?: string;
        confirmationDocs?: {
          tokenReceiptCreated?: boolean;
          tokenReceiptSkipped?: boolean;
          seedError?: string;
        };
      };
      if (!res.ok) throw new Error(json.error || 'Advance failed');
      if (json.confirmationDocs) {
        const cd = json.confirmationDocs;
        if (cd.seedError) {
          toast.warning(
            `Booking confirmed. Token receipt PDF could not be saved: ${cd.seedError}`
          );
        } else if (cd.tokenReceiptCreated) {
          toast.success(
            'Booking confirmed. Token posted to the ledger; token receipt PDF saved under Documents below.'
          );
        } else {
          toast.success(
            'Booking confirmed. Payment schedule and ledger are ready — generate or review documents below.'
          );
        }
      }
      await load();
      if (json.workflowStage === 'confirmation') {
        requestAnimationFrame(() => {
          document.getElementById('booking-documents')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        });
      }
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Advance failed');
    } finally {
      setSaving(false);
    }
  }

  async function revertStage() {
    if (!booking || cancelled || stepIndex <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'revert' })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Revert failed');
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Could not go back');
    } finally {
      setSaving(false);
    }
  }

  function applyBuyerKycFieldErrors(
    customerId: string,
    fieldErrors: { pan?: string; aadhaar?: string }
  ) {
    setBuyerKycFieldErrors((prev) => ({
      ...prev,
      [customerId]: fieldErrors
    }));
  }

  function setBuyerKycBlurError(
    customerId: string,
    field: 'pan' | 'aadhaar',
    message: string | undefined
  ) {
    setBuyerKycFieldErrors((prev) => {
      const row = { ...(prev[customerId] ?? {}) };
      if (message) row[field] = message;
      else delete row[field];
      return { ...prev, [customerId]: row };
    });
  }

  function validateAllBuyerKyc(): boolean {
    const nextErrors: Record<string, { pan?: string; aadhaar?: string }> = {};
    let ok = true;
    for (const b of buyerKyc) {
      const fieldErrors = parseBookingBuyerKycFieldErrors({
        pan_number: b.pan,
        aadhaar_last4: b.aadhaarLast4
      });
      if (fieldErrors) {
        ok = false;
        nextErrors[b.customerId] = fieldErrors;
      }
    }
    if (!ok) setBuyerKycFieldErrors(nextErrors);
    return ok;
  }

  async function saveBuyerIdentifiers(b: BuyerKyc) {
    if (!booking) return;
    const fieldErrors = parseBookingBuyerKycFieldErrors({
      pan_number: b.pan,
      aadhaar_last4: b.aadhaarLast4
    });
    if (fieldErrors) {
      applyBuyerKycFieldErrors(b.customerId, fieldErrors);
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    const panNorm = normalizePan(b.pan);
    const aadhaarNorm = normalizeAadhaar(b.aadhaarLast4);
    setBuyerKycFieldErrors((prev) => {
      const next = { ...prev };
      delete next[b.customerId];
      return next;
    });
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: b.customerId,
          panNumber: panNorm || null,
          aadhaarLast4: aadhaarNorm || null
        })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  function validateBuyerAppFormFields(b: BuyerKyc): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!b.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!b.phone || b.phone.replace(/\D/g, '').length !== 10)
      errors.phone = 'Enter a 10-digit phone number.';
    if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()))
      errors.email = 'Enter a valid email address.';
    if (!b.guardian_name?.trim())
      errors.guardian_name = "Father's/Mother's/Spouse's name is required.";
    if (!b.dob) errors.dob = 'Date of birth is required.';
    else if (!isIsoDateNotAfterToday(b.dob))
      errors.dob = 'Date of birth cannot be in the future.';
    if (!b.pan.trim()) errors.pan = 'PAN is required.';
    if (!b.aadhaarLast4.trim()) errors.aadhaar = 'Aadhaar number is required.';
    if (!b.nationality?.trim()) errors.nationality = 'Nationality is required.';
    if (!b.residential_status?.trim()) errors.residential_status = 'Residential status is required.';
    if (!b.communicationAddress?.address_line1?.trim())
      errors.comm_address = 'Communication address is required.';
    return errors;
  }

  function validateAllBuyerAppForms(): boolean {
    const allErrors: Record<string, Record<string, string>> = {};
    let ok = true;
    for (const b of buyerKyc) {
      const errors = validateBuyerAppFormFields(b);
      if (Object.keys(errors).length > 0) {
        ok = false;
        allErrors[b.customerId] = errors;
      }
    }
    setAppFormFieldErrors(allErrors);
    return ok;
  }

  async function saveBuyerApplicationDetails(b: BuyerKyc) {
    if (!booking) return;
    const errors = validateBuyerAppFormFields(b);
    if (Object.keys(errors).length > 0) {
      setAppFormFieldErrors((prev) => ({ ...prev, [b.customerId]: errors }));
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setAppFormFieldErrors((prev) => {
      const next = { ...prev };
      delete next[b.customerId];
      return next;
    });
    setSavingBuyerAppForm(b.customerId);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/application-details`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: b.customerId,
          full_name: b.fullName.trim(),
          phone: b.phone?.replace(/\D/g, '') || null,
          email: b.email?.trim() || null,
          dob: b.dob || null,
          occupation: b.occupation?.trim() || null,
          nationality: b.nationality?.trim() || null,
          guardian_name: b.guardian_name?.trim() || null,
          residential_status: b.residential_status?.trim() || null,
          passport_number: b.passport_number?.trim() || null,
          office_name_address: b.office_name_address?.trim() || null,
          pan_number: normalizePan(b.pan) || null,
          aadhaar_last4: normalizeAadhaar(b.aadhaarLast4) || null,
          permanent_address: b.permanentAddress
            ? {
              address_line1: b.permanentAddress.address_line1?.trim() || null,
              city: b.permanentAddress.city?.trim() || null,
              state: b.permanentAddress.state?.trim() || null,
              pin: b.permanentAddress.pin?.trim() || null
            }
            : null,
          communication_address: b.communicationAddress
            ? {
              address_line1: b.communicationAddress.address_line1?.trim() || null,
              city: b.communicationAddress.city?.trim() || null,
              state: b.communicationAddress.state?.trim() || null,
              pin: b.communicationAddress.pin?.trim() || null
            }
            : null
        })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(`${b.label} details saved.`);
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingBuyerAppForm(null);
    }
  }

  async function previewKycDoc(storagePath: string, docType: string, buyerLabel: string) {
    setKycPreviewLoading(true);
    try {
      const { data, error: urlErr } = await supabase.storage
        .from(KYC_BUCKET)
        .createSignedUrl(storagePath, 3600);
      if (urlErr || !data?.signedUrl) throw urlErr ?? new Error('Could not generate preview URL');
      const ext = storagePath.split('.').pop()?.toLowerCase() ?? '';
      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      setKycPreviewUrl(data.signedUrl);
      setKycPreviewIsImage(isImage);
      const docLabel = docType === 'pan' ? 'PAN' : docType === 'aadhaar' ? 'Aadhaar' : 'Photo';
      setKycPreviewTitle(`${docLabel} — ${buyerLabel}`);
      setKycPreviewOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setKycPreviewLoading(false);
    }
  }

  function openKycFilePicker(customerId: string, docType: string) {
    setKycUploadCustomerId(customerId);
    setKycDocType(docType);
    const input = kycFileRef.current;
    if (!input) return;
    input.accept = kycFileAcceptForDocType(docType);
    input.value = '';
    input.click();
  }

  async function uploadKyc() {
    const file = kycFileRef.current?.files?.[0];
    if (!file || !kycUploadCustomerId) return;
    const uploadCustomerId = kycUploadCustomerId;
    const uploadDocType = kycDocType;
    if (!isKycFileAllowed(file, uploadDocType)) {
      pageError(kycFileRejectMessage(uploadDocType));
      if (kycFileRef.current) kycFileRef.current.value = '';
      return;
    }
    const buyer = buyerKyc.find((b) => b.customerId === uploadCustomerId);
    if (!buyer) return;
    const uploadParsed = kycUploadSchema.safeParse({
      docType: uploadDocType,
      pan_number: buyer.pan,
      aadhaar_last4: buyer.aadhaarLast4,
      hasFile: true
    });
    if (!uploadParsed.success) {
      const fieldErrors: { pan?: string; aadhaar?: string } = {};
      for (const issue of uploadParsed.error.issues) {
        const key = issue.path[0];
        if (key === 'pan_number') fieldErrors.pan = issue.message;
        if (key === 'aadhaar_last4') fieldErrors.aadhaar = issue.message;
      }
      if (Object.keys(fieldErrors).length > 0) {
        applyBuyerKycFieldErrors(buyer.customerId, fieldErrors);
      }
      pageError(
        uploadParsed.error.issues.find((i) => i.path[0] === 'hasFile')?.message ??
        'Fix the highlighted fields before uploading.'
      );
      if (kycFileRef.current) kycFileRef.current.value = '';
      return;
    }
    const kycKey = `${uploadCustomerId}:${uploadDocType}`;
    setUploadingKycKey(kycKey);
    const ext = extensionFromFile(file);
    const path = `customer/${uploadCustomerId}/${uploadDocType}/${crypto.randomUUID()}${ext}`;
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: storageErr } = await supabase.storage
        .from(KYC_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (storageErr) throw storageErr;
      const { error: insErr } = await supabase.from('customer_kyc_documents').insert({
        customer_id: uploadCustomerId,
        doc_type: uploadDocType,
        storage_path: path,
        uploaded_by: user?.id ?? null,
        verified_status: 'Pending'
      });
      if (insErr) {
        await supabase.storage.from(KYC_BUCKET).remove([path]);
        throw insErr;
      }
      if (kycFileRef.current) kycFileRef.current.value = '';
      setBuyerKyc((rows) =>
        rows.map((r) => {
          if (r.customerId !== uploadCustomerId) return r;
          if (uploadDocType === 'pan') return { ...r, hasPanDoc: true, panDocPath: path };
          if (uploadDocType === 'aadhaar') return { ...r, hasAadhaarDoc: true, aadhaarDocPath: path };
          if (uploadDocType === 'photo') return { ...r, hasPhotoDoc: true, photoDocPath: path };
          return r;
        })
      );
      toast.success(`${uploadDocType === 'pan' ? 'PAN' : uploadDocType === 'aadhaar' ? 'Aadhaar' : 'Photo'} uploaded.`);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingKycKey(null);
    }
  }

  async function submitCancellation() {
    if (!booking) return;
    setCancelSubmitAttempted(true);
    const parsed = bookingCancelSchema.safeParse({ cancelReason });
    if (!parsed.success) {
      return;
    }
    setSaving(true);
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
      pageError(e instanceof Error ? e.message : 'Cancellation failed');
    } finally {
      setSaving(false);
    }
  }

  const unit = booking ? unwrapJoin(booking.units) : null;
  const unitPossessed = isUnitPossessedStatus(unit?.status);
  const customer = booking ? unwrapJoin(booking.customers) : null;

  return (
    <div className="mx-auto  space-y-6">
      
      <div className="flex flex-wrap items-center gap-3">
        <BackButton href="/crm/bookings" label="Bookings" />
        {!loading && booking ? (
          <Button variant="outline" size="sm" className="h-9 shrink-0" asChild>
            <Link href={`/crm/units/${encodeURIComponent(booking.unit_id)}`}>
              Unit page
            </Link>
          </Button>
        ) : null}
        {!loading && booking && workflowStage === 'confirmation' && !cancelled ? (
          <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1" asChild>
            <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
              <FileText className="h-4 w-4" />
              Documents
            </Link>
          </Button>
        ) : null}
      </div>

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
      <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-ds-gray-900">
            {unit?.unit_code ?? 'Booking'} · {customer?.full_name ?? '—'}
          </h1>
          <p className="text-sm text-ds-gray-500">
            Unit locked while workflow is active. Complete each step to confirm the booking.
          </p>
        </div>
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

      {loading && !booking ? (
        <CrmDetailPageSkeleton />
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
                        {formatDisplayDate(stageData.token?.date)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-ds-gray-500">Payment mode</dt>
                      <dd className="font-medium text-ds-gray-900">
                        {stageData.token?.mode ?? booking.payment_mode ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Amount (INR)</Label>
                      <InrAmountInput
                        value={
                          stageData.token?.amount ?? String(booking.booking_amount ?? '')
                        }
                        onChange={(v) =>
                          setStageData((d) => ({
                            ...d,
                            token: { ...d.token, amount: v }
                          }))
                        }
                      />
                    </div>
                    <TextInputField
                      label="Date"
                      type="date"
                      value={stageData.token?.date ?? ''}
                      onChange={(e) =>
                        setStageData((d) => ({
                          ...d,
                          token: { ...d.token, date: e.target.value }
                        }))
                      }
                    />
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Payment mode</Label>
                      <Select
                        value={stageData.token?.mode ?? booking.payment_mode ?? ''}
                        onValueChange={(v) =>
                          setStageData((d) => ({
                            ...d,
                            token: { ...d.token, mode: v }
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select payment mode…" />
                        </SelectTrigger>
                        <SelectContent>
                          {BOOKING_PAYMENT_MODE_OPTIONS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
            <Card className="space-y-6 p-4">
              <div>
                <h2 className="font-semibold text-ds-gray-900">Application form</h2>
                <p className="mt-1 text-sm text-ds-gray-600">
                  Fill all applicant details below. Fields prefilled from the customer profile can
                  be edited if needed. All required fields must be completed before the application
                  form document can be generated.
                </p>
              </div>

              {/* --- A. APPLICANT DETAILS --- */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-ds-gray-800 uppercase tracking-wide">
                  A. Applicant details
                </h3>
                {buyerKyc.map((b, bIdx) => {
                  const errs = appFormFieldErrors[b.customerId] ?? {};
                  const isSavingThis = savingBuyerAppForm === b.customerId;
                  const pre = prefilledBuyerFields.current[b.customerId];
                  return (
                    <div
                      key={b.customerId}
                      className="rounded-lg border border-ds-gray-200 p-4 space-y-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ds-primary-700">
                          {bIdx === 0 ? 'Sole/First' : bIdx === 1 ? 'Second' : `${bIdx + 1}th`} Applicant — {b.label}
                        </p>
                        {isCustomerKycComplete(b.pan, b.aadhaarLast4, [
                          ...(b.hasPanDoc ? ['pan'] : []),
                          ...(b.hasAadhaarDoc ? ['aadhaar'] : []),
                          ...(b.hasPhotoDoc ? ['photo'] : [])
                        ]) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ds-success-50 px-2 py-0.5 text-[11px] font-medium text-ds-success-700">
                            <Check className="h-3 w-3" /> KYC Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-ds-warning-50 px-2 py-0.5 text-[11px] font-medium text-ds-warning-700">
                            KYC Incomplete
                          </span>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <TextInputField
                          label="Full Name"
                          required
                          value={b.fullName}
                          placeholder="Full Name"
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, fullName: e.target.value } : r
                              )
                            )
                          }
                          error={errs.fullName}
                        />

                        <TextInputField
                          label="Father's/Mother's/Spouse's Name"
                          required
                          value={b.guardian_name ?? ''}
                          placeholder="Guardian name"
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, guardian_name: e.target.value } : r
                              )
                            )
                          }
                          error={errs.guardian_name}
                        />

                        <TextInputField
                          label="Date of Birth"
                          required
                          type="date"
                          max={todayIsoDate()}
                          value={b.dob ?? ''}
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, dob: e.target.value } : r
                              )
                            )
                          }
                          error={errs.dob}
                        />

                        <PanInputField
                          label="PAN"
                          required
                          value={b.pan}
                          placeholder="ABCDE1234F"
                          onChange={(pan) => {
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, pan } : r
                              )
                            );
                            setBuyerKycBlurError(
                              b.customerId,
                              'pan',
                              parseBookingBuyerPanInlineError(pan)
                            );
                          }}
                          error={errs.pan || buyerKycFieldErrors[b.customerId]?.pan}
                        />

                        <AadhaarInputField
                          label="Aadhaar No."
                          required
                          value={b.aadhaarLast4}
                          placeholder="123456789012"
                          onChange={(aadhaarLast4) => {
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, aadhaarLast4 }
                                  : r
                              )
                            );
                            setBuyerKycBlurError(
                              b.customerId,
                              'aadhaar',
                              parseBookingBuyerAadhaarInlineError(aadhaarLast4)
                            );
                          }}
                          error={
                            errs.aadhaar || buyerKycFieldErrors[b.customerId]?.aadhaar
                          }
                        />

                        <TextInputField
                          label="Nationality"
                          required
                          value={b.nationality ?? ''}
                          placeholder="Indian"
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, nationality: e.target.value } : r
                              )
                            )
                          }
                          error={errs.nationality}
                        />

                        {/* Residential Status */}
                        <div className="space-y-1">
                          <FieldLabel required>Residential Status</FieldLabel>
                          <Select
                            value={b.residential_status ?? ''}
                            onValueChange={(v) =>
                              setBuyerKyc((rows) =>
                                rows.map((r) =>
                                  r.customerId === b.customerId ? { ...r, residential_status: v } : r
                                )
                              )
                            }
                          >
                            <SelectTrigger aria-invalid={!!errs.residential_status}>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {['Resident Indian', 'NRI', 'Foreign National'].map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormFieldError message={errs.residential_status} />
                        </div>

                        <TextInputField
                          label="Profession / Occupation"
                          labelClassName="text-xs text-ds-gray-600"
                          value={b.occupation ?? ''}
                          placeholder="e.g. Business, Service, Professional"
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, occupation: e.target.value } : r
                              )
                            )
                          }
                        />

                        <TextInputField
                          label="Passport No. (NRI/Foreign)"
                          labelClassName="text-xs text-ds-gray-600"
                          value={b.passport_number ?? ''}
                          placeholder="Passport number"
                          onChange={(e) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, passport_number: e.target.value } : r
                              )
                            )
                          }
                        />
                      </div>

                      {/* Contact Details */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <PhoneInputField
                          label="Mobile No."
                          required
                          value={b.phone ?? ''}
                          placeholder="10-digit mobile"
                          onChange={(v) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, phone: v } : r
                              )
                            )
                          }
                          error={errs.phone}
                        />
                        <EmailInputField
                          label="Email Id"
                          value={b.email ?? ''}
                          placeholder="email@example.com"
                          onChange={(email) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId ? { ...r, email } : r
                              )
                            )
                          }
                          error={errs.email}
                        />
                      </div>

                      {/* Permanent Address */}
                      <div className="space-y-2">
                        <Label className="text-xs text-ds-gray-600 font-semibold">Permanent Address</Label>
                        <BookingAddressFields
                          addressLine={b.permanentAddress?.address_line1 ?? ''}
                          city={b.permanentAddress?.city ?? ''}
                          state={b.permanentAddress?.state ?? ''}
                          pin={b.permanentAddress?.pin ?? ''}
                          onAddressLineChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, permanentAddress: { ...(r.permanentAddress ?? { id: '', kind: 'permanent', address_line1: null, city: null, state: null, pin: null }), address_line1: val } }
                                  : r
                              )
                            )
                          }
                          onCityChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, permanentAddress: { ...(r.permanentAddress ?? { id: '', kind: 'permanent', address_line1: null, city: null, state: null, pin: null }), city: val } }
                                  : r
                              )
                            )
                          }
                          onStateChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, permanentAddress: { ...(r.permanentAddress ?? { id: '', kind: 'permanent', address_line1: null, city: null, state: null, pin: null }), state: val } }
                                  : r
                              )
                            )
                          }
                          onPinChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, permanentAddress: { ...(r.permanentAddress ?? { id: '', kind: 'permanent', address_line1: null, city: null, state: null, pin: null }), pin: val } }
                                  : r
                              )
                            )
                          }
                        />
                      </div>

                      {/* Communication Address */}
                      <div className="space-y-2">
                        <FieldLabel required>Address for Communication</FieldLabel>
                        <BookingAddressFields
                          addressLine={b.communicationAddress?.address_line1 ?? ''}
                          city={b.communicationAddress?.city ?? ''}
                          state={b.communicationAddress?.state ?? ''}
                          pin={b.communicationAddress?.pin ?? ''}
                          addressLineError={errs.comm_address}
                          onAddressLineChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, communicationAddress: { ...(r.communicationAddress ?? { id: '', kind: 'current', address_line1: null, city: null, state: null, pin: null }), address_line1: val } }
                                  : r
                              )
                            )
                          }
                          onCityChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, communicationAddress: { ...(r.communicationAddress ?? { id: '', kind: 'current', address_line1: null, city: null, state: null, pin: null }), city: val } }
                                  : r
                              )
                            )
                          }
                          onStateChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, communicationAddress: { ...(r.communicationAddress ?? { id: '', kind: 'current', address_line1: null, city: null, state: null, pin: null }), state: val } }
                                  : r
                              )
                            )
                          }
                          onPinChange={(val) =>
                            setBuyerKyc((rows) =>
                              rows.map((r) =>
                                r.customerId === b.customerId
                                  ? { ...r, communicationAddress: { ...(r.communicationAddress ?? { id: '', kind: 'current', address_line1: null, city: null, state: null, pin: null }), pin: val } }
                                  : r
                              )
                            )
                          }
                        />
                      </div>

                      <TextareaField
                        label="Office Name & Address"
                        labelClassName="text-xs text-ds-gray-600"
                        value={b.office_name_address ?? ''}
                        placeholder="Office name and address"
                        rows={2}
                        onChange={(e) =>
                          setBuyerKyc((rows) =>
                            rows.map((r) =>
                              r.customerId === b.customerId ? { ...r, office_name_address: e.target.value } : r
                            )
                          )
                        }
                      />

                      {/* KYC Documents Status & Upload */}
                      <div className="flex flex-col gap-2 border-t border-ds-gray-100 pt-3">
                        <p className="text-xs text-ds-gray-500">
                          Docs: PAN {b.hasPanDoc ? '✓' : '—'} · Aadhaar{' '}
                          {b.hasAadhaarDoc ? '✓' : '—'} · Photo {b.hasPhotoDoc ? '✓' : '—'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {b.hasPanDoc && b.panDocPath ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={kycPreviewLoading}
                              onClick={() => void previewKycDoc(b.panDocPath!, 'pan', b.label)}>
                              <Eye className="h-3 w-3" /> PAN
                            </Button>
                          ) : uploadingKycKey === `${b.customerId}:pan` ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7" disabled>
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={!!uploadingKycKey}
                              onClick={() => openKycFilePicker(b.customerId, 'pan')}>
                              <Upload className="h-3 w-3" /> PAN
                            </Button>
                          )}
                          {b.hasAadhaarDoc && b.aadhaarDocPath ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={kycPreviewLoading}
                              onClick={() => void previewKycDoc(b.aadhaarDocPath!, 'aadhaar', b.label)}>
                              <Eye className="h-3 w-3" /> Aadhaar
                            </Button>
                          ) : uploadingKycKey === `${b.customerId}:aadhaar` ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7" disabled>
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={!!uploadingKycKey}
                              onClick={() => openKycFilePicker(b.customerId, 'aadhaar')}>
                              <Upload className="h-3 w-3" /> Aadhaar
                            </Button>
                          )}
                          {b.hasPhotoDoc && b.photoDocPath ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={kycPreviewLoading}
                              onClick={() => void previewKycDoc(b.photoDocPath!, 'photo', b.label)}>
                              <Eye className="h-3 w-3" /> Photo
                            </Button>
                          ) : uploadingKycKey === `${b.customerId}:photo` ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7" disabled>
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                              disabled={!!uploadingKycKey}
                              onClick={() => openKycFilePicker(b.customerId, 'photo')}>
                              <Upload className="h-3 w-3" /> Photo
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Save buyer details */}
                      <div className="flex gap-2 border-t border-ds-gray-100 pt-3">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSavingThis || saving}
                          onClick={() => void saveBuyerApplicationDetails(b)}
                        >
                          {isSavingThis ? 'Saving…' : 'Save applicant details'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* --- B. BOOKING DETAILS (read-only from bookings + sales_inquiries) --- */}
              <div className="space-y-2 border-t border-ds-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-ds-gray-800 uppercase tracking-wide">
                  B. Booking details
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-ds-gray-500">Mode of Booking</p>
                    <p className="text-sm font-medium text-ds-gray-800">
                      {inquiryInfo?.broker_name ? 'Channel Partner' : 'Direct'}
                    </p>
                  </div>
                  {inquiryInfo?.broker_name && (
                    <>
                      <div>
                        <p className="text-xs text-ds-gray-500">Channel Partner Name</p>
                        <p className="text-sm font-medium text-ds-gray-800">
                          {inquiryInfo.broker_name}
                        </p>
                      </div>
                      {inquiryInfo.broker_rera && (
                        <div>
                          <p className="text-xs text-ds-gray-500">RERA Reg. No.</p>
                          <p className="text-sm font-medium text-ds-gray-800">
                            {inquiryInfo.broker_rera}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <p className="text-xs text-ds-gray-500">Finance from Bank / FI</p>
                    <p className="text-sm font-medium text-ds-gray-800">
                      {booking.loan_bank ? 'Yes' : 'No'}
                    </p>
                  </div>
                  {booking.loan_bank && (
                    <div>
                      <p className="text-xs text-ds-gray-500">Preferred Bank / FI</p>
                      <p className="text-sm font-medium text-ds-gray-800">
                        {booking.loan_bank}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-ds-gray-500">Mode of Payment</p>
                    <p className="text-sm font-medium text-ds-gray-800">
                      {booking.payment_mode || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ds-gray-500">Purpose of Purchase</p>
                    <p className="text-sm font-medium text-ds-gray-800">
                      {stageData.application?.purpose_of_purchase || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ds-gray-500">I Heard About You From</p>
                    <p className="text-sm font-medium text-ds-gray-800">
                      {inquiryInfo?.lead_source || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* --- G. UNIT DETAILS (read-only) --- */}
              {unit ? (
                <div className="space-y-2 border-t border-ds-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-ds-gray-800 uppercase tracking-wide">
                    G. Unit details
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-ds-gray-500">Unit No.</p>
                      <p className="text-sm font-medium text-ds-gray-800">{unit.unit_code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ds-gray-500">Tower / Wing</p>
                      <p className="text-sm font-medium text-ds-gray-800">{unit.wing_name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ds-gray-500">Floor</p>
                      <p className="text-sm font-medium text-ds-gray-800">{unit.floor ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ds-gray-500">Type</p>
                      <p className="text-sm font-medium text-ds-gray-800">{unit.unit_type ?? '—'}</p>
                    </div>
                  </div>
                  {projectName ? (
                    <p className="text-xs text-ds-gray-500">
                      Project: <span className="font-medium text-ds-gray-700">{projectName}</span>
                      {projectLocation ? ` — ${projectLocation}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <input
                ref={kycFileRef}
                type="file"
                className="hidden"
                onChange={() => void uploadKyc()}
              />

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-ds-gray-200 pt-4">
                <Button
                  type="button"
                  className="gap-1"
                  disabled={generatingApplicationForm || saving || !allBuyerAppFormsValid}
                  onClick={() => {
                    if (!validateAllBuyerAppForms()) {
                      pageError('Complete all required applicant details before generating.');
                      return;
                    }
                    void handleGenerateApplicationForm();
                  }}
                >
                  <FileText className="h-4 w-4" />
                  {generatingApplicationForm ? 'Generating…' : 'Generate application form'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={viewingApplicationForm || !applicationFormExists}
                  onClick={() => void handleViewApplicationForm()}
                >
                  <Eye className="h-4 w-4" />
                  {viewingApplicationForm ? 'Loading…' : 'View application form'}
                </Button>
                <Button type="button" variant="outline" className="gap-1" asChild>
                  <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                    <FileText className="h-4 w-4" />
                    Agreements &amp; documents
                  </Link>
                </Button>
              </div>
            </Card>
          ) : null}

          {workflowStage === 'allotment' && !cancelled ? (
            <Card className="space-y-4 p-4">
              <h2 className="font-semibold text-ds-gray-900">Allotment</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInputField
                  label="Allotment date"
                  required
                  type="date"
                  value={stageData.allotment?.allotment_date ?? ''}
                  onChange={(e) => {
                    setStageData((d) => ({
                      ...d,
                      allotment: { ...d.allotment, allotment_date: e.target.value }
                    }));
                    setAllotmentDateTouched(true);
                  }}
                  onBlur={() => setAllotmentDateTouched(true)}
                  error={allotmentDateError}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-1"
                  disabled={generatingAllotmentLetter || saving}
                  onClick={() => void handleGenerateAllotmentLetter()}
                >
                  <FileText className="h-4 w-4" />
                  {generatingAllotmentLetter ? 'Generating…' : 'Generate allotment letter'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={viewingAllotmentLetter || !allotmentLetterExists}
                  onClick={() => void handleViewAllotmentLetter()}
                >
                  <Eye className="h-4 w-4" />
                  {viewingAllotmentLetter ? 'Loading…' : 'View allotment letter'}
                </Button>
                <Button type="button" variant="outline" className="gap-1" asChild>
                  <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                    <FileText className="h-4 w-4" />
                    Agreements &amp; documents
                  </Link>
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
                      onlyUnpaid
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
                  <div
                    id="booking-documents"
                    className="space-y-3 border-t border-ds-gray-200 pt-4 scroll-mt-4"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-ds-gray-900">Booking documents</h3>
                      <p className="mt-1 text-xs text-ds-gray-500">
                        Generate each document, review/download the PDF, then click Send to notify
                        the buyer (email, SMS, WhatsApp).
                      </p>
                    </div>
                    {confirmationDocsLoading ? (
                      <p className="text-sm text-ds-gray-500">Loading document tools…</p>
                    ) : confirmationPrintPack ? (
                      <BookingDocumentsMatrixTable
                        rows={confirmationMatrixRows}
                        kycComplete={confirmationPrintPack.kycComplete}
                        generatingKind={generatingDocKind}
                        onGenerate={handleConfirmationDocGenerate}
                        onNotify={handleConfirmationDocNotify}
                        scheduleLabelById={scheduleLabelById}
                        outstandingTotal={outstandingTotal}
                        unitPossessed={unitPossessed}
                        sorting={confirmationMatrixSorting}
                        onSortingChange={onConfirmationMatrixSortingChange}
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
                    <div className="border-t border-ds-gray-200 pt-4">
                      <div className="mb-2">
                        <div className="text-sm font-semibold text-ds-gray-900">Document history</div>
                        <p className="text-xs text-ds-gray-500">
                          Every payment receipt and demand letter for this unit (including from
                          Financials). Multiple receipts and demands appear as separate rows.
                        </p>
                      </div>
                      <GeneratedDocumentsTable
                        rows={confirmationGenerated}
                        loading={confirmationDocsLoading || confirmationDocsLoadingGenerated}
                        variant="bookingFocus"
                        showDownload
                        onNotify={(_bId, docId) => handleConfirmationDocNotify(docId)}
                        scheduleLabelById={scheduleLabelById}
                        onRefresh={() => void refreshConfirmationGenerated()}
                        sorting={confirmationGeneratedSorting}
                        onSortingChange={onConfirmationGeneratedSortingChange}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="gap-1" asChild>
                      <Link href={`/crm/documents/${encodeURIComponent(booking.id)}`}>
                        <FileText className="h-4 w-4" />
                        View all documents
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/crm/financials/${bookingId}`}>
                        Ledger &amp; collections
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
                  <BookingNotificationsCard bookingId={booking.id} />
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="text-ds-error-700 border-ds-error-200"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel booking
                </Button>
                {stepIndex > 0 ? (
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => void revertStage()}
                    className="gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {saving ? 'Saving…' : 'Previous step'}
                  </Button>
                ) : null}
              </div>
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

      {/* Application Form Preview */}
      <PdfViewerDialog
        open={appFormPreviewOpen}
        onOpenChange={(open) => { setAppFormPreviewOpen(open); if (!open) setAppFormPreviewUrl(''); }}
        url={appFormPreviewUrl}
        title="Application Form"
      />

      {/* Allotment Letter Preview */}
      <PdfViewerDialog
        open={allotmentLetterPreviewOpen}
        onOpenChange={(open) => { setAllotmentLetterPreviewOpen(open); if (!open) setAllotmentLetterPreviewUrl(''); }}
        url={allotmentLetterPreviewUrl}
        title="Allotment Letter"
      />

      {/* KYC Document Preview — image or PDF */}
      {kycPreviewIsImage ? (
        <ImageViewerDialog
          open={kycPreviewOpen}
          onOpenChange={(open) => { setKycPreviewOpen(open); if (!open) setKycPreviewUrl(''); }}
          url={kycPreviewUrl}
          title={kycPreviewTitle || 'Document preview'}
        />
      ) : (
        <PdfViewerDialog
          open={kycPreviewOpen}
          onOpenChange={(open) => { setKycPreviewOpen(open); if (!open) setKycPreviewUrl(''); }}
          url={kycPreviewUrl}
          title={kycPreviewTitle || 'Document preview'}
        />
      )}

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelSubmitAttempted(false);
        }}
      >
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
              <FieldLabel required>Reason</FieldLabel>
              <Select
                value={cancelReason}
                onValueChange={(v) => {
                  setCancelReason(v);
                  setCancelSubmitAttempted(true);
                }}
              >
                <SelectTrigger aria-invalid={cancelReasonError ? true : undefined}>
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
              <FormFieldError message={cancelReasonError} />
            </div>
            <TextInputField
              label="Notes"
              value={cancelNotes}
              onChange={(e) => setCancelNotes(e.target.value)}
            />
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
