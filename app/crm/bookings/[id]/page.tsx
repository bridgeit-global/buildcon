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
import { DateInputField } from '@/components/ui/date-input-field';
import { PassportInputField } from '@/components/ui/passport-input-field';
import { TextInputField } from '@/components/ui/text-input-field';
import { Input } from '@/components/ui/input';
import { InrAmountInput } from '@/components/ui/inr-amount-input';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/ui/field-label';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';
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
import {
  isCustomerKycComplete,
  normalizeAadhaar,
  normalizePan,
  normalizePassport
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
import { kycUploadSchema, guardianNameFieldLabel } from '@/lib/customer/customer-forms.schema';
import {
  isKycFileAllowed,
  isKycImageFile,
  kycFileAcceptForDocType,
  kycFileRejectMessage
} from '@/lib/customer/kyc-file';
import {
  KycImageCropDialog,
  type KycCropConfirmPayload
} from '@/components/ui/kyc-image-crop-dialog';
import type { KycOcrDocType } from '@/lib/customer/kyc-ocr';
import {
  GeneratedDocumentsTable,
  type GeneratedDocRow
} from '@/app/crm/documents/generated-documents-table';
import {
  ApplicationAddressFields,
  applicationAddressFromRow,
  applicationAddressToPayload
} from '../application-address-fields';
import { DobInputField } from '@/components/ui/dob-input-field';
import { useMasterLookup } from '@/lib/master/use-master-lookup';
import { mergeLookupOptions } from '@/lib/master/master-lookup';
import { RESIDENTIAL_STATUS_OPTIONS } from '@/lib/customer/application-form-data';
import { formatFullName, splitFullName } from '@/lib/person-name';
import {
  effectivePermanentAddress,
  inferPermanentSameAsCorrespondence,
  residentialStatusPatch,
  validateApplicationFormBuyer,
  type ApplicationFormAddress
} from '@/lib/booking/application-form-buyer.schema';
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
  address_line2: string | null;
  address_line3: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

type BuyerKyc = {
  customerId: string;
  label: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  phone: string | null;
  phone_country: string;
  phone_secondary: string | null;
  phone_secondary_country: string;
  email: string | null;
  occupation: string | null;
  dob: string | null;
  nationality: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  residential_status: string | null;
  passport_number: string | null;
  id_proof_type: string | null;
  office_name_address: string | null;
  pan: string;
  aadhaarLast4: string;
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
  hasPhotoDoc: boolean;
  panDocPath: string | null;
  aadhaarDocPath: string | null;
  photoDocPath: string | null;
  residentialAddress: BuyerAddress | null;
  permanentAddress: BuyerAddress | null;
  permanentSameAsCorrespondence: 'same' | 'different';
};

function emptyBuyerAddress(kind: string): BuyerAddress {
  return {
    id: '',
    kind,
    address_line1: null,
    address_line2: null,
    address_line3: null,
    city: null,
    state: null,
    pin: null
  };
}

function patchBuyerAddress(
  current: BuyerAddress | null,
  kind: string,
  patch: Partial<ReturnType<typeof applicationAddressFromRow>>
): BuyerAddress {
  const merged = { ...applicationAddressFromRow(current), ...patch };
  return {
    ...(current ?? emptyBuyerAddress(kind)),
    address_line1: merged.address_line1 || null,
    address_line2: merged.address_line2 || null,
    address_line3: merged.address_line3 || null,
    city: merged.city || null,
    state: merged.state || null,
    pin: merged.pin || null
  };
}

function buyerAddressToFormAddress(
  addr: BuyerAddress | null | undefined
): ApplicationFormAddress | null {
  if (!addr) return null;
  return {
    address_line1: addr.address_line1,
    address_line2: addr.address_line2,
    address_line3: addr.address_line3,
    city: addr.city,
    state: addr.state,
    pin: addr.pin
  };
}

function buyerToApplicationFormInput(b: BuyerKyc) {
  return {
    first_name: b.first_name,
    middle_name: b.middle_name,
    last_name: b.last_name,
    phone: b.phone,
    phone_country: b.phone_country,
    phone_secondary: b.phone_secondary,
    phone_secondary_country: b.phone_secondary_country,
    email: b.email,
    guardian_name: b.guardian_name,
    guardian_relation: b.guardian_relation,
    dob: b.dob,
    nationality: b.nationality,
    residential_status: b.residential_status,
    id_proof_type: b.id_proof_type,
    passport_number: b.passport_number,
    pan: b.pan,
    aadhaarLast4: b.aadhaarLast4,
    residentialAddress: buyerAddressToFormAddress(b.residentialAddress),
    permanentAddress: buyerAddressToFormAddress(b.permanentAddress),
    permanentSameAsCorrespondence: b.permanentSameAsCorrespondence
  };
}

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
  const kycUploadTargetRef = useRef<{ customerId: string; docType: string }>({
    customerId: '',
    docType: 'pan'
  });
  const prefilledBuyerFields = useRef<Record<string, Set<string>>>({});
  const [kycUploadCustomerId, setKycUploadCustomerId] = useState('');
  const [kycDocType, setKycDocType] = useState('pan');
  const [uploadingKycKey, setUploadingKycKey] = useState<string | null>(null);
  const [kycCropOpen, setKycCropOpen] = useState(false);
  const [kycCropImageUrl, setKycCropImageUrl] = useState('');
  const [kycCropDocType, setKycCropDocType] = useState<KycOcrDocType>('pan');
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
  const { activeNames: masterCustomerRelations } = useMasterLookup('customer_relation');

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
          'id,full_name,first_name,middle_name,last_name,phone,phone_secondary,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,guardian_relation,residential_status,passport_number,id_proof_type,office_name_address'
        )
        .in('id', buyerIdList),
      supabase
        .from('customer_addresses')
        .select('id,customer_id,kind,address_line1,address_line2,address_line3,city,state,pin')
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
      const resAddr = addrs.find((a) => a.kind === 'current') ?? addrs[0] ?? null;
      const residentialAddress = resAddr
        ? {
            id: resAddr.id,
            kind: resAddr.kind,
            address_line1: resAddr.address_line1,
            address_line2: resAddr.address_line2,
            address_line3: resAddr.address_line3,
            city: resAddr.city,
            state: resAddr.state,
            pin: resAddr.pin
          }
        : null;
      const permanentAddress = permAddr
        ? {
            id: permAddr.id,
            kind: permAddr.kind,
            address_line1: permAddr.address_line1,
            address_line2: permAddr.address_line2,
            address_line3: permAddr.address_line3,
            city: permAddr.city,
            state: permAddr.state,
            pin: permAddr.pin
          }
        : null;
      const first = String(c?.first_name ?? '').trim();
      const middle = String(c?.middle_name ?? '').trim();
      const last = String(c?.last_name ?? '').trim();
      const fromFull =
        !first && !last
          ? splitFullName(String(c?.full_name ?? b.label))
          : null;
      return {
        customerId: b.id,
        label: b.label,
        first_name: first || fromFull?.first_name || '',
        middle_name: middle || fromFull?.middle_name || '',
        last_name: last || fromFull?.last_name || '',
        phone: (c?.phone as string | null) ?? null,
        phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
        phone_secondary: (c?.phone_secondary as string | null) ?? null,
        phone_secondary_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
        email: (c?.email as string | null) ?? null,
        occupation: (c?.occupation as string | null) ?? null,
        dob: (c?.dob as string | null) ?? null,
        nationality: (c?.nationality as string | null) || 'Indian',
        guardian_name: (c?.guardian_name as string | null) ?? null,
        guardian_relation: (c?.guardian_relation as string | null) ?? null,
        residential_status:
          (c?.residential_status as string | null) || 'Resident Indian',
        passport_number: (c?.passport_number as string | null) ?? null,
        id_proof_type: (c?.id_proof_type as string | null) ?? null,
        office_name_address: (c?.office_name_address as string | null) ?? null,
        pan: String(c?.pan_number ?? ''),
        aadhaarLast4: String(c?.aadhaar_last4 ?? ''),
        hasPanDoc: docs.has('pan'),
        hasAadhaarDoc: docs.has('aadhaar'),
        hasPhotoDoc: docs.has('photo'),
        panDocPath: paths['pan'] ?? null,
        aadhaarDocPath: paths['aadhaar'] ?? null,
        photoDocPath: paths['photo'] ?? null,
        residentialAddress,
        permanentAddress,
        permanentSameAsCorrespondence: inferPermanentSameAsCorrespondence(
          buyerAddressToFormAddress(residentialAddress),
          buyerAddressToFormAddress(permanentAddress)
        )
      };
    });
    const prefilled: Record<string, Set<string>> = {};
    for (const nb of nextBuyerKyc) {
      const fields = new Set<string>();
      if (nb.first_name || nb.last_name) fields.add('name');
      if (nb.guardian_name) fields.add('guardian_name');
      if (nb.guardian_relation) fields.add('guardian_relation');
      if (nb.dob) fields.add('dob');
      if (nb.pan) fields.add('pan');
      if (nb.aadhaarLast4) fields.add('aadhaarLast4');
      if (nb.nationality) fields.add('nationality');
      if (nb.residential_status) fields.add('residential_status');
      if (nb.id_proof_type) fields.add('id_proof_type');
      if (nb.occupation) fields.add('occupation');
      if (nb.passport_number) fields.add('passport_number');
      if (nb.phone) fields.add('phone');
      if (nb.phone_secondary) fields.add('phone_secondary');
      if (nb.email) fields.add('email');
      if (nb.residentialAddress?.address_line1) fields.add('residentialAddress');
      if (nb.permanentAddress?.address_line1) fields.add('permanentAddress');
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
    return validateApplicationFormBuyer(buyerToApplicationFormInput(b));
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
      const permanent = effectivePermanentAddress(buyerToApplicationFormInput(b));
      const res = await fetch(`/api/crm/bookings/${booking.id}/application-details`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: b.customerId,
          first_name: b.first_name.trim(),
          middle_name: b.middle_name.trim(),
          last_name: b.last_name.trim(),
          full_name: formatFullName({
            first_name: b.first_name,
            middle_name: b.middle_name,
            last_name: b.last_name
          }),
          phone: b.phone?.replace(/\D/g, '') || null,
          phone_secondary: b.phone_secondary?.replace(/\D/g, '') || null,
          email: b.email?.trim() || null,
          dob: b.dob || null,
          occupation: b.occupation?.trim() || null,
          nationality: b.nationality?.trim() || null,
          guardian_name: b.guardian_name?.trim() || null,
          guardian_relation: b.guardian_relation?.trim() || null,
          residential_status: b.residential_status?.trim() || null,
          passport_number: normalizePassport(b.passport_number ?? '') || null,
          id_proof_type: b.id_proof_type?.trim() || null,
          office_name_address: b.office_name_address?.trim() || null,
          pan_number: normalizePan(b.pan) || null,
          aadhaar_last4: normalizeAadhaar(b.aadhaarLast4) || null,
          permanent_same_as_correspondence: b.permanentSameAsCorrespondence === 'same',
          communication_address: b.residentialAddress
            ? applicationAddressToPayload(applicationAddressFromRow(b.residentialAddress))
            : null,
          permanent_address: permanent
            ? applicationAddressToPayload(applicationAddressFromRow(permanent))
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

  function closeKycCropDialog() {
    setKycCropOpen(false);
    if (kycCropImageUrl) {
      URL.revokeObjectURL(kycCropImageUrl);
      setKycCropImageUrl('');
    }
    if (kycFileRef.current) kycFileRef.current.value = '';
  }

  function openKycFilePicker(customerId: string, docType: string) {
    kycUploadTargetRef.current = { customerId, docType };
    setKycUploadCustomerId(customerId);
    setKycDocType(docType);
    const input = kycFileRef.current;
    if (!input) return;
    input.accept = kycFileAcceptForDocType(docType);
    input.value = '';
    input.click();
  }

  async function persistBuyerIdentifiersFromUpload(
    customerId: string,
    pan: string | undefined,
    aadhaar: string | undefined
  ) {
    const patch: Record<string, string | null> = {};
    if (pan !== undefined) {
      const panNorm = normalizePan(pan);
      if (panNorm) patch.pan_number = panNorm;
    }
    if (aadhaar !== undefined) {
      const aadhaarNorm = normalizeAadhaar(aadhaar);
      if (aadhaarNorm) patch.aadhaar_last4 = aadhaarNorm;
    }
    if (Object.keys(patch).length === 0) return;

    setBuyerKyc((rows) =>
      rows.map((r) =>
        r.customerId === customerId
          ? {
              ...r,
              ...(patch.pan_number ? { pan: patch.pan_number } : {}),
              ...(patch.aadhaar_last4 ? { aadhaarLast4: patch.aadhaar_last4 } : {})
            }
          : r
      )
    );

    const { error } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', customerId);
    if (error) {
      throw new Error(error.message || 'Document uploaded but failed to save PAN / Aadhaar');
    }
  }

  async function uploadKycFile(
    file: File,
    uploadCustomerId: string,
    uploadDocType: string,
    identifiers?: { pan?: string; aadhaar?: string }
  ) {
    const buyer = buyerKyc.find((b) => b.customerId === uploadCustomerId);
    if (!buyer) return;

    const panForValidate = identifiers?.pan ?? buyer.pan;
    const aadhaarForValidate = identifiers?.aadhaar ?? buyer.aadhaarLast4;
    const uploadParsed = kycUploadSchema.safeParse({
      docType: uploadDocType,
      pan_number: panForValidate,
      aadhaar_last4: aadhaarForValidate,
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
      return;
    }

    const kycKey = `${uploadCustomerId}:${uploadDocType}`;
    setUploadingKycKey(kycKey);
    const ext = extensionFromFile(file) || '.jpg';
    const path = `customer/${uploadCustomerId}/${uploadDocType}/${crypto.randomUUID()}${ext}`;
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { error: storageErr } = await supabase.storage
        .from(KYC_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined
        });
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

      if (uploadDocType === 'pan' || uploadDocType === 'aadhaar') {
        try {
          await persistBuyerIdentifiersFromUpload(
            uploadCustomerId,
            identifiers?.pan,
            identifiers?.aadhaar
          );
        } catch (e) {
          pageError(
            e instanceof Error
              ? e.message
              : 'Document uploaded but failed to save PAN / Aadhaar'
          );
        }
      }

      if (kycFileRef.current) kycFileRef.current.value = '';
      setBuyerKyc((rows) =>
        rows.map((r) => {
          if (r.customerId !== uploadCustomerId) return r;
          const withIds =
            uploadDocType === 'pan' && identifiers?.pan
              ? { ...r, pan: identifiers.pan }
              : uploadDocType === 'aadhaar' && identifiers?.aadhaar
                ? { ...r, aadhaarLast4: identifiers.aadhaar }
                : r;
          if (uploadDocType === 'pan') {
            return { ...withIds, hasPanDoc: true, panDocPath: path };
          }
          if (uploadDocType === 'aadhaar') {
            return { ...withIds, hasAadhaarDoc: true, aadhaarDocPath: path };
          }
          if (uploadDocType === 'photo') {
            return { ...withIds, hasPhotoDoc: true, photoDocPath: path };
          }
          return withIds;
        })
      );
      toast.success(
        `${uploadDocType === 'pan' ? 'PAN' : uploadDocType === 'aadhaar' ? 'Aadhaar' : 'Photo'} uploaded.`
      );
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingKycKey(null);
    }
  }

  async function onKycFileSelected() {
    const file = kycFileRef.current?.files?.[0];
    const { customerId: uploadCustomerId, docType: uploadDocType } =
      kycUploadTargetRef.current;
    if (!file || !uploadCustomerId) return;
    setKycUploadCustomerId(uploadCustomerId);
    setKycDocType(uploadDocType);
    if (!isKycFileAllowed(file, uploadDocType)) {
      pageError(kycFileRejectMessage(uploadDocType));
      if (kycFileRef.current) kycFileRef.current.value = '';
      return;
    }

    if (
      isKycImageFile(file) &&
      (uploadDocType === 'pan' ||
        uploadDocType === 'aadhaar' ||
        uploadDocType === 'photo')
    ) {
      if (kycCropImageUrl) URL.revokeObjectURL(kycCropImageUrl);
      const url = URL.createObjectURL(file);
      setKycCropDocType(uploadDocType);
      setKycCropImageUrl(url);
      setKycCropOpen(true);
      return;
    }

    // PDF (or non-croppable): require typed identifiers first.
    await uploadKycFile(file, uploadCustomerId, uploadDocType);
  }

  async function onKycCropConfirm(payload: KycCropConfirmPayload) {
    const uploadCustomerId =
      kycUploadTargetRef.current.customerId || kycUploadCustomerId;
    const uploadDocType = kycCropDocType;
    if (!uploadCustomerId) return;
    await uploadKycFile(payload.file, uploadCustomerId, uploadDocType, {
      pan: payload.pan,
      aadhaar: payload.aadhaar
    });
    closeKycCropDialog();
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
              <h2 className="font-semibold text-ds-gray-900">Token details</h2>
              {tokenStageLocked ? (
                <>
                  <p className="text-sm text-ds-gray-600">
                    Token commitment was captured when this booking was created (from inquiry
                    or the bookings form). Payment is posted to the ledger at booking
                    confirmation. Token details cannot be changed — continue to the
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
                  <p className="text-sm text-ds-gray-600">
                    Capture the token the customer will give. This is a commitment —
                    money is recorded on the ledger only when you reach booking
                    confirmation.
                  </p>
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
                    <DateInputField
                      label="Date"
                      value={stageData.token?.date ?? ''}
                      onChange={(value) =>
                        setStageData((d) => ({
                          ...d,
                          token: { ...d.token, date: value }
                        }))
                      }
                      placeholder="Select token date"
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
                    Save token details
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

              {!kycComplete ? (
                <div className="rounded-lg border border-ds-warning-200 bg-ds-warning-50/60 p-3 text-sm text-ds-warning-900">
                  <p className="font-medium">KYC incomplete</p>
                  <p className="mt-1 text-ds-warning-800">
                    Complete PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads for every
                    applicant before generating the application form.
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
                          href={`/crm/customers/${encodeURIComponent(b.customerId)}?tab=kyc`}
                        >
                          KYC — {b.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* --- A. APPLICANT DETAILS --- */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-ds-gray-800 uppercase tracking-wide">
                  A. Applicant details
                </h3>
                {buyerKyc.map((b, bIdx) => {
                  const errs = appFormFieldErrors[b.customerId] ?? {};
                  const isSavingThis = savingBuyerAppForm === b.customerId;
                  const customerRelationOptions = mergeLookupOptions(
                    masterCustomerRelations,
                    buyerKyc.map((row) => row.guardian_relation)
                  );
                  const residentialValues = applicationAddressFromRow(b.residentialAddress);
                  const permanentValues = applicationAddressFromRow(b.permanentAddress);
                  const patchBuyerField = <K extends keyof BuyerKyc>(
                    key: K,
                    value: BuyerKyc[K]
                  ) =>
                    setBuyerKyc((rows) =>
                      rows.map((r) =>
                        r.customerId === b.customerId ? { ...r, [key]: value } : r
                      )
                    );
                  const patchResidential = (
                    patch: Partial<ReturnType<typeof applicationAddressFromRow>>
                  ) =>
                    setBuyerKyc((rows) =>
                      rows.map((r) =>
                        r.customerId === b.customerId
                          ? {
                              ...r,
                              residentialAddress: patchBuyerAddress(
                                r.residentialAddress,
                                'current',
                                patch
                              )
                            }
                          : r
                      )
                    );
                  const patchPermanent = (
                    patch: Partial<ReturnType<typeof applicationAddressFromRow>>
                  ) =>
                    setBuyerKyc((rows) =>
                      rows.map((r) =>
                        r.customerId === b.customerId
                          ? {
                              ...r,
                              permanentAddress: patchBuyerAddress(
                                r.permanentAddress,
                                'permanent',
                                patch
                              )
                            }
                          : r
                      )
                    );
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

                      {/* Basic information — matches customer create */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <TextInputField
                          label="First name"
                          required
                          value={b.first_name}
                          placeholder="e.g. Amit"
                          onChange={(e) => patchBuyerField('first_name', e.target.value)}
                          error={errs.first_name}
                        />
                        <TextInputField
                          label="Middle name"
                          value={b.middle_name}
                          placeholder="Optional"
                          onChange={(e) => patchBuyerField('middle_name', e.target.value)}
                        />
                        <TextInputField
                          label="Last name"
                          required
                          value={b.last_name}
                          placeholder="e.g. Deshmukh"
                          onChange={(e) => patchBuyerField('last_name', e.target.value)}
                          error={errs.last_name}
                        />
                        <PhoneInputField
                          label="Primary mobile number"
                          required
                          value={b.phone ?? ''}
                          onChange={(v) => patchBuyerField('phone', v)}
                          countryCode={b.phone_country}
                          onCountryCodeChange={(v) =>
                            patchBuyerField('phone_country', v)
                          }
                          error={errs.phone}
                        />
                        <PhoneInputField
                          label="Secondary mobile number"
                          value={b.phone_secondary ?? ''}
                          onChange={(v) => patchBuyerField('phone_secondary', v)}
                          countryCode={b.phone_secondary_country}
                          onCountryCodeChange={(v) =>
                            patchBuyerField('phone_secondary_country', v)
                          }
                          error={errs.phone_secondary}
                        />
                        <EmailInputField
                          label="Email"
                          value={b.email ?? ''}
                          placeholder="name@email.com"
                          onChange={(email) => patchBuyerField('email', email)}
                          error={errs.email}
                        />
                        <DobInputField
                          required
                          value={b.dob ?? ''}
                          onChange={(dob) => patchBuyerField('dob', dob)}
                          error={errs.dob}
                        />
                        <TextInputField
                          label="Occupation"
                          value={b.occupation ?? ''}
                          placeholder="Salaried / Business…"
                          onChange={(e) => patchBuyerField('occupation', e.target.value)}
                        />
                      </div>

                      {/* Identity & residency — matches customer create */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1">
                          <FieldLabel required>Nationality</FieldLabel>
                          <Select
                            value={b.nationality || undefined}
                            onValueChange={(v) => patchBuyerField('nationality', v)}
                          >
                            <SelectTrigger aria-invalid={!!errs.nationality}>
                              <SelectValue placeholder="Select nationality" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Indian">Indian</SelectItem>
                              <SelectItem value="NRI">NRI</SelectItem>
                              <SelectItem value="Foreign National">Foreign National</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormFieldError message={errs.nationality} />
                        </div>

                        <div className="space-y-1">
                          <FieldLabel required>Customer relation</FieldLabel>
                          <Select
                            value={b.guardian_relation ?? ''}
                            onValueChange={(v) =>
                              patchBuyerField('guardian_relation', v)
                            }
                          >
                            <SelectTrigger aria-invalid={!!errs.guardian_relation}>
                              <SelectValue placeholder="Select relation" />
                            </SelectTrigger>
                            <SelectContent>
                              {customerRelationOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormFieldError message={errs.guardian_relation} />
                        </div>

                        <TextInputField
                          label={guardianNameFieldLabel(b.guardian_relation)}
                          required
                          value={b.guardian_name ?? ''}
                          placeholder="As on PAN / Aadhaar"
                          onChange={(e) =>
                            patchBuyerField('guardian_name', e.target.value)
                          }
                          error={errs.guardian_name}
                        />

                        <div className="space-y-1">
                          <FieldLabel required>Residential status</FieldLabel>
                          <Select
                            value={b.residential_status || undefined}
                            onValueChange={(v) =>
                              setBuyerKyc((rows) =>
                                rows.map((r) => {
                                  if (r.customerId !== b.customerId) return r;
                                  const patch = residentialStatusPatch(
                                    r.residential_status,
                                    v,
                                    r.id_proof_type
                                  );
                                  return {
                                    ...r,
                                    residential_status: patch.residential_status,
                                    id_proof_type: patch.id_proof_type
                                  };
                                })
                              )
                            }
                          >
                            <SelectTrigger aria-invalid={!!errs.residential_status}>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {RESIDENTIAL_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormFieldError message={errs.residential_status} />
                        </div>

                        {b.residential_status !== 'Resident Indian' ? (
                          <PassportInputField
                            label="Passport no. (NRI / foreign)"
                            required
                            residentialStatus={b.residential_status}
                            value={b.passport_number ?? ''}
                            placeholder="K1234567"
                            onChange={(value) =>
                              patchBuyerField('passport_number', value)
                            }
                            error={errs.passport_number}
                          />
                        ) : null}
                      </div>

                      {/* Identity & KYC — application-required */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2">
                          <PanInputField
                            label="PAN"
                            required
                            value={b.pan}
                            placeholder="ABCDE1234F"
                            onChange={(pan) => {
                              patchBuyerField('pan', pan);
                              setBuyerKycBlurError(
                                b.customerId,
                                'pan',
                                parseBookingBuyerPanInlineError(pan)
                              );
                            }}
                            error={errs.pan || buyerKycFieldErrors[b.customerId]?.pan}
                          />
                          <div className="flex flex-wrap gap-2">
                            {b.hasPanDoc && b.panDocPath ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={kycPreviewLoading}
                                onClick={() =>
                                  void previewKycDoc(b.panDocPath!, 'pan', b.label)
                                }
                              >
                                <Eye className="h-3.5 w-3.5" /> View PAN
                              </Button>
                            ) : uploadingKycKey === `${b.customerId}:pan` ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled
                              >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={!!uploadingKycKey}
                                onClick={() => openKycFilePicker(b.customerId, 'pan')}
                              >
                                <Upload className="h-3.5 w-3.5" /> Upload PAN
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <AadhaarInputField
                            label="Aadhaar number"
                            required
                            value={b.aadhaarLast4}
                            placeholder="123456789012"
                            onChange={(aadhaarLast4) => {
                              patchBuyerField('aadhaarLast4', aadhaarLast4);
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
                          <div className="flex flex-wrap gap-2">
                            {b.hasAadhaarDoc && b.aadhaarDocPath ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={kycPreviewLoading}
                                onClick={() =>
                                  void previewKycDoc(
                                    b.aadhaarDocPath!,
                                    'aadhaar',
                                    b.label
                                  )
                                }
                              >
                                <Eye className="h-3.5 w-3.5" /> View Aadhaar
                              </Button>
                            ) : uploadingKycKey === `${b.customerId}:aadhaar` ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled
                              >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={!!uploadingKycKey}
                                onClick={() =>
                                  openKycFilePicker(b.customerId, 'aadhaar')
                                }
                              >
                                <Upload className="h-3.5 w-3.5" /> Upload Aadhaar
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <FieldLabel>Photo</FieldLabel>
                          <div className="flex flex-wrap gap-2">
                            {b.hasPhotoDoc && b.photoDocPath ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={kycPreviewLoading}
                                onClick={() =>
                                  void previewKycDoc(b.photoDocPath!, 'photo', b.label)
                                }
                              >
                                <Eye className="h-3.5 w-3.5" /> View photo
                              </Button>
                            ) : uploadingKycKey === `${b.customerId}:photo` ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled
                              >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-11 gap-1 text-xs sm:min-h-9"
                                disabled={!!uploadingKycKey}
                                onClick={() => openKycFilePicker(b.customerId, 'photo')}
                              >
                                <Upload className="h-3.5 w-3.5" /> Upload photo
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Residential Address */}
                      <div className="space-y-2">
                        <FieldLabel required>Residential address</FieldLabel>
                        <ApplicationAddressFields
                          values={residentialValues}
                          onChange={(patch) => patchResidential(patch)}
                          errors={{
                            line1: errs.res_address_line1,
                            line2: errs.res_address_line2,
                            line3: errs.res_address_line3,
                            pin: errs.res_address_pin,
                            city: errs.res_address_city,
                            state: errs.res_address_state
                          }}
                        />
                      </div>

                      {/* Permanent vs Correspondence */}
                      <div className="space-y-3">
                        <FieldLabel required>
                          Permanent address same as correspondence address?
                        </FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ['same', 'Same'],
                              ['different', 'Different']
                            ] as const
                          ).map(([value, label]) => (
                            <Button
                              key={value}
                              type="button"
                              size="sm"
                              variant={
                                b.permanentSameAsCorrespondence === value
                                  ? 'default'
                                  : 'outline'
                              }
                              onClick={() =>
                                patchBuyerField(
                                  'permanentSameAsCorrespondence',
                                  value
                                )
                              }
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                        {b.permanentSameAsCorrespondence === 'different' ? (
                          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                            <FieldLabel required>Permanent address</FieldLabel>
                            <ApplicationAddressFields
                              values={permanentValues}
                              onChange={(patch) => patchPermanent(patch)}
                              errors={{
                                line1: errs.perm_address_line1,
                                line2: errs.perm_address_line2,
                                line3: errs.perm_address_line3,
                                pin: errs.perm_address_pin,
                                city: errs.perm_address_city,
                                state: errs.perm_address_state
                              }}
                            />
                          </div>
                        ) : null}
                      </div>

                      <TextareaField
                        label="Office name & address"
                        value={b.office_name_address ?? ''}
                        placeholder="Office name and address"
                        rows={2}
                        onChange={(e) =>
                          patchBuyerField('office_name_address', e.target.value)
                        }
                      />

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
                onChange={() => void onKycFileSelected()}
              />

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-ds-gray-200 pt-4">
                <Button
                  type="button"
                  className="gap-1"
                  disabled={
                    generatingApplicationForm || saving || !kycComplete || !allBuyerAppFormsValid
                  }
                  onClick={() => {
                    if (!kycComplete) {
                      pageError(
                        'Complete KYC for all applicants (PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads) before generating the application form.'
                      );
                      return;
                    }
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
                <DateInputField
                  label="Allotment date"
                  required
                  value={stageData.allotment?.allotment_date ?? ''}
                  onChange={(value) => {
                    setStageData((d) => ({
                      ...d,
                      allotment: { ...d.allotment, allotment_date: value }
                    }));
                    setAllotmentDateTouched(true);
                  }}
                  onBlur={() => setAllotmentDateTouched(true)}
                  error={allotmentDateError}
                  placeholder="Select allotment date"
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

      {/* KYC crop + OCR — portal dialog, kept at page root */}
      {kycCropImageUrl ? (
        <KycImageCropDialog
          open={kycCropOpen}
          imageUrl={kycCropImageUrl}
          docType={kycCropDocType}
          autoScan
          initialPan={
            buyerKyc.find((b) => b.customerId === kycUploadCustomerId)?.pan ?? ''
          }
          initialAadhaar={
            buyerKyc.find((b) => b.customerId === kycUploadCustomerId)
              ?.aadhaarLast4 ?? ''
          }
          fileBaseName={`${kycCropDocType}-crop`}
          onCancel={closeKycCropDialog}
          onConfirm={onKycCropConfirm}
        />
      ) : null}

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
