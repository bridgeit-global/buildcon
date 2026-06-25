'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { pageError } from '@/lib/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CrmDetailPageSkeleton,
  CrmTableBodySkeleton
} from '@/app/crm/_components/crm-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

import { CustomerAddressDialog } from '@/app/crm/customers/customer-address-dialog';
import { CustomerNomineeDialog } from '@/app/crm/customers/customer-nominee-dialog';
import { CustomerBankDialog } from '@/app/crm/customers/customer-bank-dialog';
import { CustomerKycIdentityForm } from '@/app/crm/customers/customer-kyc-identity-form';
import { CustomerKycUploadDialog } from '@/app/crm/customers/customer-kyc-upload-dialog';
import { CustomerProfileFields } from '@/app/crm/customers/customer-form-ui';
import {
  customerEditPayload,
  customerEditSchema,
  customerEditValuesFromCustomer,
  EMPTY_ADDRESS,
  EMPTY_BANK,
  EMPTY_NOMINEE,
  addressValuesFromRow,
  bankValuesFromRow,
  nomineeValuesFromRow,
  type AddressFormValues,
  type BankFormValues,
  type CustomerEditFormValues,
  type KycIdentityFormValues,
  type NomineeFormValues
} from '@/lib/customer/customer-forms.schema';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format-display-date';
import {
  isCustomerKycComplete,
  maskAadhaarLast4,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';
import {
  isKycFileAllowed,
  kycFileRejectMessage
} from '@/lib/customer/kyc-file';
import { PdfViewerDialog } from '@/components/pdf-viewer-dialog';
import { ImageViewerDialog } from '@/components/image-viewer-dialog';
import BackButton from '@/components/buttons/back-button';

const CUSTOMER_SELECT =
  'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address,created_at';

const KYC_BUCKET = 'kyc';

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  occupation: string | null;
  nationality: string | null;
  pan_number: string | null;
  aadhaar_last4: string | null;
  guardian_name: string | null;
  residential_status: string | null;
  passport_number: string | null;
  office_name_address: string | null;
  created_at: string;
};

type CustomerInquiryRow = {
  id: string;
  created_at: string;
  lead_source: string;
  broker_id: string | null;
  brokers: { full_name: string } | { full_name: string }[] | null;
  interested_in: string | null;
  projects: { name: string } | { name: string }[] | null;
  units:
    | { unit_code: string; wing_name: string }
    | { unit_code: string; wing_name: string }[]
    | null;
};

type AddressRow = {
  id: string;
  kind: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

type NomineeRow = {
  id: string;
  nominee_name: string | null;
  relationship: string | null;
  nominee_dob: string | null;
};

type BankRow = {
  id: string;
  bank_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  branch: string | null;
};

type KycDocRow = {
  id: string;
  doc_type: string;
  verified_status: string;
  uploaded_at: string;
  storage_path: string;
};

type DetailTab = 'profile' | 'kyc' | 'address' | 'nominee' | 'bank';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function initialsFromName(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function extensionFromFile(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && dot < name.length - 1) return name.slice(dot).toLowerCase();
  const t = file.type;
  if (t === 'application/pdf') return '.pdf';
  if (t === 'image/jpeg' || t === 'image/jpg') return '.jpg';
  if (t === 'image/png') return '.png';
  if (t === 'image/webp') return '.webp';
  return '.bin';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="w-[140px] shrink-0 text-xs font-medium text-gray-500">
        {label}
      </div>
      <div className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'kyc', label: 'KYC' },
  { id: 'address', label: 'Address' },
  { id: 'nominee', label: 'Nominee' },
  { id: 'bank', label: 'Bank' }
];

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = params.id;

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [customerInquiries, setCustomerInquiries] = useState<CustomerInquiryRow[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);

  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [nominees, setNominees] = useState<NomineeRow[]>([]);
  const [bankRows, setBankRows] = useState<BankRow[]>([]);
  const [kycDocs, setKycDocs] = useState<KycDocRow[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [extrasSaving, setExtrasSaving] = useState(false);

  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressDefaults, setAddressDefaults] = useState<AddressFormValues>(EMPTY_ADDRESS);

  const [nomineeFormOpen, setNomineeFormOpen] = useState(false);
  const [editingNomineeId, setEditingNomineeId] = useState<string | null>(null);
  const [nomineeDefaults, setNomineeDefaults] = useState<NomineeFormValues>(EMPTY_NOMINEE);

  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankDefaults, setBankDefaults] = useState<BankFormValues>(EMPTY_BANK);

  const [kycFormOpen, setKycFormOpen] = useState(false);
  const [kycPreviewOpen, setKycPreviewOpen] = useState(false);
  const [kycPreviewUrl, setKycPreviewUrl] = useState('');
  const [kycPreviewTitle, setKycPreviewTitle] = useState('');
  const [kycPreviewIsImage, setKycPreviewIsImage] = useState(false);
  const [kycPreviewLoading, setKycPreviewLoading] = useState(false);

  const editForm = useForm<CustomerEditFormValues>({
    resolver: zodResolver(customerEditSchema),
    defaultValues: customerEditValuesFromCustomer({
      full_name: '',
      phone: null,
      email: null,
      dob: null,
      occupation: null,
      nationality: null,
      pan_number: null,
      aadhaar_last4: null,
      guardian_name: null,
      residential_status: null,
      passport_number: null,
      office_name_address: null
    }),
    mode: 'onChange'
  });

  // Fetch customer by ID
  useEffect(() => {
    let cancelled = false;
    setLoadingCustomer(true);
    setNotFound(false);
    (async () => {
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT)
        .eq('id', customerId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setCustomer(data as CustomerRow);
        editForm.reset(customerEditValuesFromCustomer(data as CustomerRow));
      }
      setLoadingCustomer(false);
    })();
    return () => { cancelled = true; };
  }, [customerId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set tab from URL param
  useEffect(() => {
    const tab = searchParams.get('tab') as DetailTab | null;
    if (tab && DETAIL_TABS.some((t) => t.id === tab)) {
      setDetailTab(tab);
    }
  }, [searchParams]);

  // Fetch inquiries
  useEffect(() => {
    let cancelled = false;
    setLoadingInquiries(true);
    (async () => {
      const { data, error } = await supabase
        .from('sales_inquiries')
        .select(
          `id, created_at, lead_source, broker_id,
           brokers ( full_name ),
           interested_in,
           projects ( name ),
           units ( unit_code, wing_name )`
        )
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled) {
        if (!error) setCustomerInquiries((data ?? []) as unknown as CustomerInquiryRow[]);
        setLoadingInquiries(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, supabase]);

  // Fetch extras (addresses, nominees, banks, kyc docs)
  useEffect(() => {
    let cancelled = false;
    setLoadingExtras(true);
    (async () => {
      const [a, n, b, k] = await Promise.all([
        supabase.from('customer_addresses').select('id,kind,address_line1,city,state,pin').eq('customer_id', customerId).order('created_at', { ascending: true }),
        supabase.from('customer_nominees').select('id,nominee_name,relationship,nominee_dob').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('customer_bank_details').select('id,bank_name,account_no,ifsc,branch').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('customer_kyc_documents').select('id,doc_type,verified_status,uploaded_at,storage_path').eq('customer_id', customerId).order('uploaded_at', { ascending: false })
      ]);
      if (cancelled) return;
      setAddresses((a.data ?? []) as AddressRow[]);
      setNominees((n.data ?? []) as NomineeRow[]);
      setBankRows((b.data ?? []) as BankRow[]);
      setKycDocs((k.data ?? []) as KycDocRow[]);
      setLoadingExtras(false);
    })();
    return () => { cancelled = true; };
  }, [customerId, supabase]);

  const latestInquiry = customerInquiries[0] ?? null;
  const latestBrokerName =
    latestInquiry && String(latestInquiry.lead_source || '').toLowerCase() === 'broker'
      ? embedOne(latestInquiry.brokers)?.full_name ?? null
      : null;

  const kycDocTypes = useMemo(() => kycDocs.map((d) => d.doc_type), [kycDocs]);
  const customerKycComplete = customer
    ? isCustomerKycComplete(customer.pan_number, customer.aadhaar_last4, kycDocTypes)
    : false;

  async function updateCustomer(values: CustomerEditFormValues) {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customerEditPayload(values))
        .eq('id', customerId)
        .select(CUSTOMER_SELECT)
        .single();
      if (error) throw error;
      setCustomer(data as CustomerRow);
      editForm.reset(customerEditValuesFromCustomer(data as CustomerRow));
      setEditMode(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  // Address operations
  function openAddressCreate() {
    setEditingAddressId(null);
    setAddressDefaults(EMPTY_ADDRESS);
    setAddressFormOpen(true);
  }
  function openAddressEdit(row: AddressRow) {
    setEditingAddressId(row.id);
    setAddressDefaults(addressValuesFromRow(row));
    setAddressFormOpen(true);
  }
  async function saveAddress(values: AddressFormValues) {
    setExtrasSaving(true);
    try {
      const payload = {
        kind: values.kind,
        address_line1: values.address_line1.trim(),
        city: values.city.trim() || null,
        state: values.state.trim() || null,
        pin: values.pin.trim() || null
      };
      if (editingAddressId) {
        const { data, error } = await supabase
          .from('customer_addresses')
          .update(payload)
          .eq('id', editingAddressId)
          .eq('customer_id', customerId)
          .select('id,kind,address_line1,city,state,pin')
          .single();
        if (error) throw error;
        setAddresses((prev) => prev.map((a) => (a.id === data.id ? (data as AddressRow) : a)));
      } else {
        const { data, error } = await supabase
          .from('customer_addresses')
          .insert({ customer_id: customerId, ...payload })
          .select('id,kind,address_line1,city,state,pin')
          .single();
        if (error) throw error;
        setAddresses((prev) => [...prev, data as AddressRow]);
      }
      setAddressFormOpen(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save address');
    } finally {
      setExtrasSaving(false);
    }
  }
  async function deleteAddress(id: string) {
    if (!window.confirm('Remove this address?')) return;
    setExtrasSaving(true);
    try {
      const { error } = await supabase.from('customer_addresses').delete().eq('id', id).eq('customer_id', customerId);
      if (error) throw error;
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to remove address');
    } finally {
      setExtrasSaving(false);
    }
  }

  // Nominee operations
  function openNomineeCreate() {
    setEditingNomineeId(null);
    setNomineeDefaults(EMPTY_NOMINEE);
    setNomineeFormOpen(true);
  }
  function openNomineeEdit(row: NomineeRow) {
    setEditingNomineeId(row.id);
    setNomineeDefaults(nomineeValuesFromRow(row));
    setNomineeFormOpen(true);
  }
  async function saveNominee(values: NomineeFormValues) {
    setExtrasSaving(true);
    try {
      const payload = {
        nominee_name: values.nominee_name.trim(),
        relationship: values.relationship.trim() || null,
        nominee_dob: values.nominee_dob || null
      };
      if (editingNomineeId) {
        const { data, error } = await supabase
          .from('customer_nominees')
          .update(payload)
          .eq('id', editingNomineeId)
          .eq('customer_id', customerId)
          .select('id,nominee_name,relationship,nominee_dob')
          .single();
        if (error) throw error;
        setNominees((prev) => prev.map((n) => (n.id === data.id ? (data as NomineeRow) : n)));
      } else {
        const { data, error } = await supabase
          .from('customer_nominees')
          .insert({ customer_id: customerId, ...payload })
          .select('id,nominee_name,relationship,nominee_dob')
          .single();
        if (error) throw error;
        setNominees((prev) => [data as NomineeRow, ...prev]);
      }
      setNomineeFormOpen(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save nominee');
    } finally {
      setExtrasSaving(false);
    }
  }
  async function deleteNominee(id: string) {
    if (!window.confirm('Remove this nominee?')) return;
    setExtrasSaving(true);
    try {
      const { error } = await supabase.from('customer_nominees').delete().eq('id', id).eq('customer_id', customerId);
      if (error) throw error;
      setNominees((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to remove nominee');
    } finally {
      setExtrasSaving(false);
    }
  }

  // Bank operations
  function openBankCreate() {
    setEditingBankId(null);
    setBankDefaults(EMPTY_BANK);
    setBankFormOpen(true);
  }
  function openBankEdit(row: BankRow) {
    setEditingBankId(row.id);
    setBankDefaults(bankValuesFromRow(row));
    setBankFormOpen(true);
  }
  async function saveBank(values: BankFormValues) {
    setExtrasSaving(true);
    try {
      const payload = {
        bank_name: values.bank_name.trim(),
        account_no: values.account_no.trim() || null,
        ifsc: values.ifsc.trim() || null,
        branch: values.branch.trim() || null
      };
      if (editingBankId) {
        const { data, error } = await supabase
          .from('customer_bank_details')
          .update(payload)
          .eq('id', editingBankId)
          .eq('customer_id', customerId)
          .select('id,bank_name,account_no,ifsc,branch')
          .single();
        if (error) throw error;
        setBankRows((prev) => prev.map((b) => (b.id === data.id ? (data as BankRow) : b)));
      } else {
        const { data, error } = await supabase
          .from('customer_bank_details')
          .insert({ customer_id: customerId, ...payload })
          .select('id,bank_name,account_no,ifsc,branch')
          .single();
        if (error) throw error;
        setBankRows((prev) => [data as BankRow, ...prev]);
      }
      setBankFormOpen(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save bank details');
    } finally {
      setExtrasSaving(false);
    }
  }
  async function deleteBank(id: string) {
    if (!window.confirm('Remove this bank record?')) return;
    setExtrasSaving(true);
    try {
      const { error } = await supabase.from('customer_bank_details').delete().eq('id', id).eq('customer_id', customerId);
      if (error) throw error;
      setBankRows((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to remove bank record');
    } finally {
      setExtrasSaving(false);
    }
  }

  // KYC operations
  async function persistCustomerIdentifiers(pan: string, aadhaarLast4: string): Promise<CustomerRow | null> {
    const panNorm = normalizePan(pan);
    const a4 = normalizeAadhaar(aadhaarLast4);
    const { data, error } = await supabase
      .from('customers')
      .update({ pan_number: panNorm || null, aadhaar_last4: a4 || null })
      .eq('id', customerId)
      .select(CUSTOMER_SELECT)
      .single();
    if (error) throw error;
    setCustomer(data as CustomerRow);
    return data as CustomerRow;
  }
  async function saveKycIdentityDetails(values: KycIdentityFormValues) {
    setExtrasSaving(true);
    try {
      await persistCustomerIdentifiers(values.pan_number, values.aadhaar_last4);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save PAN / Aadhaar');
    } finally {
      setExtrasSaving(false);
    }
  }
  async function uploadKycDocument(input: { docType: string; pan_number: string; aadhaar_last4: string; file: File }) {
    const { docType, pan_number: kycPanInput, aadhaar_last4: kycAadhaarInput, file } = input;
    if (file.size > 50 * 1024 * 1024) { pageError('File is too large (max 50 MB).'); return; }
    if (!isKycFileAllowed(file, docType)) { pageError(kycFileRejectMessage(docType)); return; }
    setExtrasSaving(true);
    const ext = extensionFromFile(file);
    const path = `customer/${customerId}/${docType}/${crypto.randomUUID()}${ext}`;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: storageErr } = await supabase.storage.from(KYC_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
      if (storageErr) throw storageErr;
      const { data: row, error: insErr } = await supabase
        .from('customer_kyc_documents')
        .insert({ customer_id: customerId, doc_type: docType, storage_path: path, uploaded_by: user?.id ?? null, verified_status: 'Pending' })
        .select('id,doc_type,verified_status,uploaded_at,storage_path')
        .single();
      if (insErr) { await supabase.storage.from(KYC_BUCKET).remove([path]); throw insErr; }
      setKycDocs((prev) => [row as KycDocRow, ...prev]);
      const panToSave = docType === 'pan' ? kycPanInput : customer?.pan_number ?? '';
      const aadhaarToSave = docType === 'aadhaar' ? kycAadhaarInput : customer?.aadhaar_last4 ?? '';
      if (panToSave.trim() || aadhaarToSave.trim()) {
        try { await persistCustomerIdentifiers(panToSave, aadhaarToSave); } catch (e) {
          pageError(e instanceof Error ? e.message : 'Document uploaded but failed to save PAN / Aadhaar on customer');
        }
      }
      setKycFormOpen(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to upload document');
    } finally {
      setExtrasSaving(false);
    }
  }
  async function openKycFile(doc: KycDocRow) {
    setKycPreviewLoading(true);
    try {
      const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(doc.storage_path, 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('No download URL');
      const ext = doc.storage_path.split('.').pop()?.toLowerCase() ?? '';
      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      const docLabel = doc.doc_type === 'pan' ? 'PAN' : doc.doc_type === 'aadhaar' ? 'Aadhaar' : doc.doc_type === 'photo' ? 'Photo' : doc.doc_type;
      setKycPreviewUrl(data.signedUrl);
      setKycPreviewIsImage(isImage);
      setKycPreviewTitle(`${docLabel} — ${customer?.full_name ?? 'Customer'}`);
      setKycPreviewOpen(true);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Could not open the file');
    } finally {
      setKycPreviewLoading(false);
    }
  }
  async function deleteKycDoc(doc: KycDocRow) {
    if (!window.confirm('Remove this document from the record and delete the stored file?')) return;
    setExtrasSaving(true);
    try {
      const { error: delErr } = await supabase.from('customer_kyc_documents').delete().eq('id', doc.id).eq('customer_id', customerId);
      if (delErr) throw delErr;
      await supabase.storage.from(KYC_BUCKET).remove([doc.storage_path]);
      setKycDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to remove document');
    } finally {
      setExtrasSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadingCustomer) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BackButton href="/crm/customers" label="Customers" />
        </div>
        <CrmDetailPageSkeleton />
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BackButton href="/crm/customers" label="Customers" />
        </div>
        <Card className="p-6 text-center text-sm text-ds-gray-500">Customer not found.</Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb / back nav */}
      <div className="flex items-center gap-2">
        <BackButton href="/crm/customers" label="Customers" />
      </div>
      {/* Detail Card */}
      <Card className="p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 pb-4">
          <div
            className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 border-ds-primary-200 bg-ds-primary-50 text-lg font-bold text-ds-primary-600"
            aria-hidden
          >
            {initialsFromName(customer.full_name)}
          </div>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">{customer.full_name}</div>
              <div className="text-sm text-gray-500">{customer.phone ?? customer.email ?? '—'}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {customerKycComplete ? (
                  <span className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
                    <CheckCircle2 className="size-3" />
                    KYC complete
                  </span>
                ) : null}
                {latestInquiry ? (
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      String(latestInquiry.lead_source || '').toLowerCase() === 'broker'
                        ? 'border border-teal-200 bg-teal-50 text-teal-800'
                        : 'border border-gray-200 bg-gray-50 text-gray-700'
                    )}
                  >
                    Latest source: {latestInquiry.lead_source}
                    {latestBrokerName ? ` · ${latestBrokerName}` : ''}
                  </span>
                ) : (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                    No inquiries yet
                  </span>
                )}
              </div>
            </div>

            {!editMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  editForm.reset(customerEditValuesFromCustomer(customer));
                  setEditMode(true);
                }}
              >
                Edit
              </Button>
            ) : null}
          </div>
        </div>

        {/* Inline edit form */}
        {editMode ? (
          <form
            onSubmit={editForm.handleSubmit(
              async (values) => updateCustomer(values),
              () => pageError('Fix the highlighted fields before saving.')
            )}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="text-sm font-semibold text-ds-gray-800">Edit customer</div>
            <CustomerProfileFields control={editForm.control} showKyc />
            <div className="flex justify-end gap-2 border-t border-ds-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditMode(false);
                  editForm.reset(customerEditValuesFromCustomer(customer));
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            {/* Tabs */}
            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
              {DETAIL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={cn(
                    'shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors',
                    detailTab === t.id
                      ? 'border border-b-0 border-gray-200 bg-white text-ds-primary-600'
                      : 'border border-transparent text-gray-500 hover:text-gray-800'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Profile tab */}
            {detailTab === 'profile' ? (
              <div className="mt-4 flex flex-col gap-4">
                <div className="rounded-lg border bg-white">
                  <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-700">
                    Contact &amp; identity
                  </div>
                  <div className="px-4 py-1">
                    <InfoRow label="Phone" value={customer.phone ?? '—'} />
                    <InfoRow label="Email" value={customer.email ?? '—'} />
                    <InfoRow label="Date of birth" value={formatDisplayDate(customer.dob)} />
                    <InfoRow label="Occupation" value={customer.occupation ?? '—'} />
                    <InfoRow label="Nationality" value={customer.nationality ?? '—'} />
                    <InfoRow label="Father / mother / spouse" value={customer.guardian_name ?? '—'} />
                    <InfoRow label="Residential status" value={customer.residential_status ?? '—'} />
                    <InfoRow label="Passport no." value={customer.passport_number ?? '—'} />
                    <InfoRow label="Office name & address" value={customer.office_name_address ?? '—'} />
                    <InfoRow label="PAN" value={customer.pan_number ?? '—'} />
                    <InfoRow
                      label="Aadhaar"
                      value={customer.aadhaar_last4 ? maskAadhaarLast4(customer.aadhaar_last4) : '—'}
                    />
                    <InfoRow label="Customer since" value={formatDisplayDateTime(customer.created_at)} />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900">Sales inquiries</div>
                  <div className="text-xs text-gray-500">Per-project leads; broker appears when source is Broker.</div>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-ds-gray-200">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">When</th>
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Project</th>
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Unit</th>
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Source</th>
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Broker</th>
                          <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Interest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingInquiries && customerInquiries.length === 0 ? (
                          <CrmTableBodySkeleton colSpan={6} rows={4} />
                        ) : customerInquiries.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-12 text-center text-ds-gray-500">No inquiries yet.</td></tr>
                        ) : (
                          customerInquiries.map((row) => {
                            const u = embedOne(row.units);
                            const brokerNm = embedOne(row.brokers)?.full_name;
                            const showBroker = String(row.lead_source || '').toLowerCase() === 'broker';
                            return (
                              <tr key={row.id} className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60">
                                <td className="whitespace-nowrap px-4 py-3 text-ds-gray-700">{formatDisplayDateTime(row.created_at)}</td>
                                <td className="px-4 py-3 text-ds-gray-900">{embedOne(row.projects)?.name ?? '—'}</td>
                                <td className="px-4 py-3 text-ds-gray-900">{u ? `${u.unit_code} · ${u.wing_name}` : '—'}</td>
                                <td className="px-4 py-3 text-ds-gray-600">{row.lead_source}</td>
                                <td className="px-4 py-3 text-ds-gray-600">{showBroker ? brokerNm ?? '—' : '—'}</td>
                                <td className="px-4 py-3 text-ds-gray-600">{row.interested_in ?? '—'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {/* KYC tab */}
            {detailTab === 'kyc' ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">PAN &amp; Aadhaar</div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Saved on the customer record when KYC is complete (12-digit Aadhaar, PAN, and uploaded PAN, Aadhaar, and photo). Used on booking application forms.
                      </p>
                    </div>
                    {customerKycComplete ? (
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
                        KYC complete
                      </span>
                    ) : null}
                  </div>
                  <CustomerKycIdentityForm customer={customer} saving={extrasSaving} onSubmit={saveKycIdentityDetails} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">KYC documents</div>
                  <Button type="button" size="sm" onClick={() => setKycFormOpen(true)} disabled={extrasSaving || loadingExtras}>
                    Upload document
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="space-y-3 p-6">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : kycDocs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      No documents yet. Upload a PDF or image (max 50 MB). Files are stored in the private{' '}
                      <code className="text-xs">kyc</code> bucket.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
                            <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Document</th>
                            <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Status</th>
                            <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Uploaded</th>
                            <th className="h-10 px-4 text-right align-middle text-xs font-semibold text-ds-gray-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kycDocs.map((d) => (
                            <tr key={d.id} className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60">
                              <td className="px-4 py-3 font-medium text-ds-gray-900">{d.doc_type}</td>
                              <td className="px-4 py-3 text-ds-gray-600">{d.verified_status}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-ds-gray-600">{formatDisplayDateTime(d.uploaded_at)}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button type="button" variant="outline" size="sm" onClick={() => void openKycFile(d)} disabled={extrasSaving || kycPreviewLoading || !d.storage_path}>View</Button>
                                  <Button type="button" variant="destructive" size="sm" onClick={() => void deleteKycDoc(d)} disabled={extrasSaving}>Delete</Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <CustomerKycUploadDialog
                  open={kycFormOpen}
                  onOpenChange={setKycFormOpen}
                  saving={extrasSaving}
                  initialPan={customer.pan_number ?? ''}
                  initialAadhaar={customer.aadhaar_last4 ?? ''}
                  onUpload={uploadKycDocument}
                />
              </div>
            ) : null}

            {/* Address tab */}
            {detailTab === 'address' ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Addresses</div>
                    <p className="text-xs text-gray-500">
                      Current → communication address; permanent → application form permanent address.
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={openAddressCreate} disabled={extrasSaving || loadingExtras}>
                    Add address
                  </Button>
                </div>

                {loadingExtras ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : addresses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No address saved for this customer.
                  </div>
                ) : (
                  addresses.map((a) => (
                    <div key={a.id} className="rounded-lg border bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          {a.kind === 'permanent' ? 'Permanent' : 'Current'} address
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => openAddressEdit(a)} disabled={extrasSaving}>Edit</Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAddress(a.id)} disabled={extrasSaving}>Delete</Button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-900">
                        <div>{a.address_line1 ?? '—'}</div>
                        <div className="text-gray-600">{[a.city, a.state, a.pin].filter(Boolean).join(', ') || '—'}</div>
                      </div>
                    </div>
                  ))
                )}

                <CustomerAddressDialog
                  open={addressFormOpen}
                  onOpenChange={setAddressFormOpen}
                  saving={extrasSaving}
                  editing={Boolean(editingAddressId)}
                  defaultValues={addressDefaults}
                  onSubmit={saveAddress}
                />
              </div>
            ) : null}

            {/* Nominee tab */}
            {detailTab === 'nominee' ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">Nominees</div>
                  <Button type="button" size="sm" onClick={openNomineeCreate} disabled={extrasSaving || loadingExtras}>
                    Add nominee
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="space-y-3 p-6">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : nominees.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">No nominee records.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {nominees.map((n) => (
                        <div key={n.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">{n.nominee_name ?? '—'}</div>
                            <div className="mt-1 text-xs text-gray-600">
                              {n.relationship ?? '—'} · DOB {n.nominee_dob ? formatDisplayDate(n.nominee_dob) : '—'}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => openNomineeEdit(n)} disabled={extrasSaving}>Edit</Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => void deleteNominee(n.id)} disabled={extrasSaving}>Delete</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <CustomerNomineeDialog
                  open={nomineeFormOpen}
                  onOpenChange={setNomineeFormOpen}
                  saving={extrasSaving}
                  editing={Boolean(editingNomineeId)}
                  defaultValues={nomineeDefaults}
                  onSubmit={saveNominee}
                />
              </div>
            ) : null}

            {/* Bank tab */}
            {detailTab === 'bank' ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">Bank accounts</div>
                  <Button type="button" size="sm" onClick={openBankCreate} disabled={extrasSaving || loadingExtras}>
                    Add bank
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="space-y-3 p-6">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : bankRows.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">No bank details on file.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {bankRows.map((b) => (
                        <div key={b.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">{b.bank_name ?? '—'}</div>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                              <div>Account: {b.account_no ?? '—'}</div>
                              <div>IFSC: {b.ifsc ?? '—'}</div>
                              <div className="sm:col-span-2">Branch: {b.branch ?? '—'}</div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => openBankEdit(b)} disabled={extrasSaving}>Edit</Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => void deleteBank(b.id)} disabled={extrasSaving}>Delete</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <CustomerBankDialog
                  open={bankFormOpen}
                  onOpenChange={setBankFormOpen}
                  saving={extrasSaving}
                  editing={Boolean(editingBankId)}
                  defaultValues={bankDefaults}
                  onSubmit={saveBank}
                />
              </div>
            ) : null}
          </>
        )}
      </Card>

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
    </div>
  );
}
