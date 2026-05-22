'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RESIDENTIAL_STATUS_OPTIONS } from '@/lib/customer/application-form-data';
import {
  isAadhaarLast4Valid,
  isCustomerKycComplete,
  isPanValid,
  maskAadhaarLast4,
  normalizeAadhaarLast4,
  normalizePan
} from '@/lib/customer/kyc-identifiers';

const CUSTOMER_SELECT =
  'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address,created_at';

const LIST_PAGE_SIZE = 40;

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

function normalizePhoneDigits(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

type CustomerFormDraft = {
  full_name: string;
  phone: string;
  email: string;
  pan_number?: string;
  aadhaar_last4?: string;
};

type CustomerFormFieldErrors = {
  full_name?: string;
  phone?: string;
  email?: string;
  pan_number?: string;
  aadhaar_last4?: string;
};

const CUSTOMER_FORM_DIALOG_CLASS =
  'flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl';

function isValidEmail(email: string) {
  const t = email.trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function validateCustomerForm(draft: CustomerFormDraft): CustomerFormFieldErrors {
  const errors: CustomerFormFieldErrors = {};
  if (!draft.full_name.trim()) {
    errors.full_name = 'Customer name is required.';
  }
  if (normalizePhoneDigits(draft.phone).length !== 10) {
    errors.phone = 'Enter a 10-digit phone number.';
  }
  if (!isValidEmail(draft.email)) {
    errors.email = 'Enter a valid email address.';
  }
  const panNorm = normalizePan(draft.pan_number ?? '');
  if (panNorm && !isPanValid(panNorm)) {
    errors.pan_number = 'Enter a valid PAN (e.g. ABCDE1234F).';
  }
  const a4Raw = String(draft.aadhaar_last4 ?? '').trim();
  if (a4Raw && !isAadhaarLast4Valid(a4Raw)) {
    errors.aadhaar_last4 = 'Enter the last 4 digits of Aadhaar.';
  }
  return errors;
}

function hasCustomerFormErrors(errors: CustomerFormFieldErrors) {
  return Object.keys(errors).length > 0;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
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

const KYC_BUCKET = 'kyc';

const KYC_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'photo', label: 'Photo' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'other', label: 'Other' }
];

function extensionFromFile(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && dot < name.length - 1) {
    return name.slice(dot).toLowerCase();
  }
  const t = file.type;
  if (t === 'application/pdf') return '.pdf';
  if (t === 'image/jpeg' || t === 'image/jpg') return '.jpg';
  if (t === 'image/png') return '.png';
  if (t === 'image/webp') return '.webp';
  return '.bin';
}

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinnedCustomer, setPinnedCustomer] = useState<CustomerRow | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextOffset, setListNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    full_name: '',
    phone: '',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    guardian_name: '',
    residential_status: 'Resident Indian',
    passport_number: '',
    office_name_address: ''
  });
  const [editDraft, setEditDraft] = useState({
    full_name: '',
    phone: '',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    pan_number: '',
    aadhaar_last4: '',
    guardian_name: '',
    residential_status: 'Resident Indian',
    passport_number: '',
    office_name_address: ''
  });
  const [draftFieldErrors, setDraftFieldErrors] = useState<CustomerFormFieldErrors>(
    {}
  );
  const [editFieldErrors, setEditFieldErrors] = useState<CustomerFormFieldErrors>(
    {}
  );

  const [customerInquiries, setCustomerInquiries] = useState<
    CustomerInquiryRow[]
  >([]);
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
  const [addressForm, setAddressForm] = useState({
    kind: 'current' as 'current' | 'permanent',
    address_line1: '',
    city: '',
    state: '',
    pin: ''
  });

  const [nomineeFormOpen, setNomineeFormOpen] = useState(false);
  const [editingNomineeId, setEditingNomineeId] = useState<string | null>(null);
  const [nomineeForm, setNomineeForm] = useState({
    nominee_name: '',
    relationship: '',
    nominee_dob: ''
  });

  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    account_no: '',
    ifsc: '',
    branch: ''
  });

  const [kycFormOpen, setKycFormOpen] = useState(false);
  const [kycDocType, setKycDocType] = useState('aadhaar');
  const kycFileRef = useRef<HTMLInputElement>(null);
  const [kycPanInput, setKycPanInput] = useState('');
  const [kycAadhaarInput, setKycAadhaarInput] = useState('');
  const [identityPan, setIdentityPan] = useState('');
  const [identityAadhaar, setIdentityAadhaar] = useState('');

  const fetchCustomerList = useCallback(
    async (opts: { reset: boolean }) => {
      const offset = opts.reset ? 0 : listNextOffset;
      if (opts.reset) {
        setLoading(true);
        setListHasMore(false);
        setListNextOffset(0);
      } else {
        if (!listHasMore || loadingMore) return;
        setLoadingMore(true);
      }
            try {
        const params = new URLSearchParams({
          limit: String(LIST_PAGE_SIZE),
          offset: String(offset)
        });
        if (searchQuery) params.set('q', searchQuery);
        const res = await fetch(`/api/crm/customers?${params.toString()}`);
        const body = (await res.json()) as {
          error?: string;
          items?: CustomerRow[];
          hasMore?: boolean;
          nextOffset?: number;
          total?: number | null;
        };
        if (!res.ok) throw new Error(body.error || 'Failed to load customers');
        const rows = body.items ?? [];
        setCustomers((prev) => (opts.reset ? rows : [...prev, ...rows]));
        setListHasMore(Boolean(body.hasMore));
        setListNextOffset(body.nextOffset ?? offset + rows.length);
        if (opts.reset && body.total != null) setListTotal(body.total);
        if (opts.reset) {
          const urlCustomerId = searchParams.get('customer');
          setSelectedId((prev) => {
            const preferred = urlCustomerId || prev;
            if (preferred && rows.some((r) => r.id === preferred)) return preferred;
            return rows[0]?.id ?? null;
          });
        }
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Failed to load customers');
        if (opts.reset) {
          setCustomers([]);
          setListTotal(null);
        }
      } finally {
        if (opts.reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [listHasMore, listNextOffset, loadingMore, searchParams, searchQuery]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchCustomerList({ reset: true });
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = listScrollRef.current;
    const target = loadMoreSentinelRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void fetchCustomerList({ reset: false });
        }
      },
      { root, rootMargin: '120px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchCustomerList]);

  useEffect(() => {
    const customerId = searchParams.get('customer');
    if (!customerId) return;
    setSelectedId(customerId);
    if (searchParams.get('tab') === 'kyc') {
      setDetailTab('kyc');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setCustomerInquiries([]);
      setLoadingInquiries(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingInquiries(true);
      const { data, error: qErr } = await supabase
        .from('sales_inquiries')
        .select(
          `
          id,
          created_at,
          lead_source,
          broker_id,
          brokers ( full_name ),
          interested_in,
          projects ( name ),
          units ( unit_code, wing_name )
        `
        )
        .eq('customer_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled) {
        if (qErr) setCustomerInquiries([]);
        else
          setCustomerInquiries((data ?? []) as unknown as CustomerInquiryRow[]);
        setLoadingInquiries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  useEffect(() => {
    if (!selectedId) {
      setAddresses([]);
      setNominees([]);
      setBankRows([]);
      setKycDocs([]);
      setLoadingExtras(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingExtras(true);
      const [a, n, b, k] = await Promise.all([
        supabase
          .from('customer_addresses')
          .select('id,kind,address_line1,city,state,pin')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: true }),
        supabase
          .from('customer_nominees')
          .select('id,nominee_name,relationship,nominee_dob')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_bank_details')
          .select('id,bank_name,account_no,ifsc,branch')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_kyc_documents')
          .select('id,doc_type,verified_status,uploaded_at,storage_path')
          .eq('customer_id', selectedId)
          .order('uploaded_at', { ascending: false })
      ]);
      if (cancelled) return;
      setAddresses((a.data ?? []) as AddressRow[]);
      setNominees((n.data ?? []) as NomineeRow[]);
      setBankRows((b.data ?? []) as BankRow[]);
      setKycDocs((k.data ?? []) as KycDocRow[]);
      setLoadingExtras(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      customers.find((c) => c.id === selectedId) ??
      (pinnedCustomer?.id === selectedId ? pinnedCustomer : null)
    );
  }, [customers, pinnedCustomer, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setPinnedCustomer(null);
      return;
    }
    const inList = customers.find((c) => c.id === selectedId);
    if (inList) {
      setPinnedCustomer(inList);
      return;
    }
    if (pinnedCustomer?.id === selectedId) return;
    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT)
        .eq('id', selectedId)
        .maybeSingle();
      if (!cancelled && !qErr && data) {
        setPinnedCustomer(data as CustomerRow);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers, pinnedCustomer?.id, selectedId, supabase]);

  function selectCustomer(row: CustomerRow) {
    setSelectedId(row.id);
    setPinnedCustomer(row);
  }

  const latestInquiry = customerInquiries[0] ?? null;
  const latestBrokerName =
    latestInquiry &&
    String(latestInquiry.lead_source || '').toLowerCase() === 'broker'
      ? embedOne(latestInquiry.brokers)?.full_name ?? null
      : null;

  const kycDocTypes = useMemo(
    () => kycDocs.map((d) => d.doc_type),
    [kycDocs]
  );
  const customerKycComplete = selected
    ? isCustomerKycComplete(
        selected.pan_number,
        selected.aadhaar_last4,
        kycDocTypes
      )
    : false;

  useEffect(() => {
    if (!selected) return;
    setIdentityPan(selected.pan_number ?? '');
    setIdentityAadhaar(selected.aadhaar_last4 ?? '');
  }, [selected?.id, selected?.pan_number, selected?.aadhaar_last4]);

  async function createCustomer() {
    const fieldErrors = validateCustomerForm(draft);
    setDraftFieldErrors(fieldErrors);
    if (hasCustomerFormErrors(fieldErrors)) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    const full_name = draft.full_name.trim();
    const phoneDigits = normalizePhoneDigits(draft.phone);
    setSaving(true);
        try {
      const { data, error: insErr } = await supabase
        .from('customers')
        .insert({
          full_name,
          phone: phoneDigits,
          email: draft.email.trim() || null,
          dob: draft.dob || null,
          occupation: draft.occupation || null,
          nationality: draft.nationality || null,
          guardian_name: draft.guardian_name.trim() || null,
          residential_status: draft.residential_status || null,
          passport_number: draft.passport_number.trim() || null,
          office_name_address: draft.office_name_address.trim() || null
        })
        .select(CUSTOMER_SELECT)
        .single();

      if (insErr) throw insErr;
      const row = data as CustomerRow;
      setCustomers((cs) => [row, ...cs]);
      setListTotal((t) => (t != null ? t + 1 : t));
      selectCustomer(row);
      setOpen(false);
      setDraftFieldErrors({});
      setDraft({
        full_name: '',
        phone: '',
        email: '',
        dob: '',
        occupation: '',
        nationality: 'Indian',
        guardian_name: '',
        residential_status: 'Resident Indian',
        passport_number: '',
        office_name_address: ''
      });
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  async function updateCustomer() {
    if (!selectedId) return;
    const fieldErrors = validateCustomerForm(editDraft);
    setEditFieldErrors(fieldErrors);
    if (hasCustomerFormErrors(fieldErrors)) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    const full_name = editDraft.full_name.trim();
    const phoneDigits = normalizePhoneDigits(editDraft.phone);
    setSaving(true);
        try {
      const { data, error: upErr } = await supabase
        .from('customers')
        .update({
          full_name,
          phone: phoneDigits,
          email: editDraft.email.trim() || null,
          dob: editDraft.dob || null,
          occupation: editDraft.occupation || null,
          nationality: editDraft.nationality || null,
          pan_number: normalizePan(editDraft.pan_number) || null,
          aadhaar_last4: normalizeAadhaarLast4(editDraft.aadhaar_last4) || null,
          guardian_name: editDraft.guardian_name.trim() || null,
          residential_status: editDraft.residential_status || null,
          passport_number: editDraft.passport_number.trim() || null,
          office_name_address: editDraft.office_name_address.trim() || null
        })
        .eq('id', selectedId)
        .select(CUSTOMER_SELECT)
        .single();

      if (upErr) throw upErr;
      const row = data as CustomerRow;
      setCustomers((cs) => cs.map((c) => (c.id === row.id ? row : c)));
      setPinnedCustomer((p) => (p?.id === row.id ? row : p));
      setEditFieldErrors({});
      setEditOpen(false);
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  function openEditDialog() {
    if (!selected) return;
        setEditFieldErrors({});
    setEditDraft({
      full_name: selected.full_name,
      phone: selected.phone ?? '',
      email: selected.email ?? '',
      dob: selected.dob ? String(selected.dob).slice(0, 10) : '',
      occupation: selected.occupation ?? '',
      nationality: selected.nationality || 'Indian',
      pan_number: selected.pan_number ?? '',
      aadhaar_last4: selected.aadhaar_last4 ?? '',
      guardian_name: selected.guardian_name ?? '',
      residential_status:
        selected.residential_status || 'Resident Indian',
      passport_number: selected.passport_number ?? '',
      office_name_address: selected.office_name_address ?? ''
    });
    setEditOpen(true);
  }

  function openAddressCreate() {
        setEditingAddressId(null);
    setAddressForm({
      kind: 'current',
      address_line1: '',
      city: '',
      state: '',
      pin: ''
    });
    setAddressFormOpen(true);
  }

  function openAddressEdit(row: AddressRow) {
        setEditingAddressId(row.id);
    setAddressForm({
      kind: row.kind === 'permanent' ? 'permanent' : 'current',
      address_line1: row.address_line1 ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      pin: row.pin ?? ''
    });
    setAddressFormOpen(true);
  }

  async function saveAddress() {
    if (!selectedId) return;
    const line = addressForm.address_line1.trim();
    if (!line) {
      pageError('Address line is required.');
      return;
    }
    setExtrasSaving(true);
        try {
      const payload = {
        kind: addressForm.kind,
        address_line1: line,
        city: addressForm.city.trim() || null,
        state: addressForm.state.trim() || null,
        pin: addressForm.pin.trim() || null
      };
      if (editingAddressId) {
        const { data, error: upErr } = await supabase
          .from('customer_addresses')
          .update(payload)
          .eq('id', editingAddressId)
          .eq('customer_id', selectedId)
          .select('id,kind,address_line1,city,state,pin')
          .single();
        if (upErr) throw upErr;
        const row = data as AddressRow;
        setAddresses((prev) =>
          prev.map((a) => (a.id === row.id ? row : a))
        );
      } else {
        const { data, error: insErr } = await supabase
          .from('customer_addresses')
          .insert({ customer_id: selectedId, ...payload })
          .select('id,kind,address_line1,city,state,pin')
          .single();
        if (insErr) throw insErr;
        const row = data as AddressRow;
        setAddresses((prev) => [...prev, row]);
      }
      setAddressFormOpen(false);
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to save address'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!selectedId) return;
    if (!window.confirm('Remove this address?')) return;
    setExtrasSaving(true);
        try {
      const { error: delErr } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', id)
        .eq('customer_id', selectedId);
      if (delErr) throw delErr;
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to remove address'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  function openNomineeCreate() {
        setEditingNomineeId(null);
    setNomineeForm({
      nominee_name: '',
      relationship: '',
      nominee_dob: ''
    });
    setNomineeFormOpen(true);
  }

  function openNomineeEdit(row: NomineeRow) {
        setEditingNomineeId(row.id);
    setNomineeForm({
      nominee_name: row.nominee_name ?? '',
      relationship: row.relationship ?? '',
      nominee_dob: row.nominee_dob
        ? String(row.nominee_dob).slice(0, 10)
        : ''
    });
    setNomineeFormOpen(true);
  }

  async function saveNominee() {
    if (!selectedId) return;
    const name = nomineeForm.nominee_name.trim();
    if (!name) {
      pageError('Nominee name is required.');
      return;
    }
    setExtrasSaving(true);
        try {
      const payload = {
        nominee_name: name,
        relationship: nomineeForm.relationship.trim() || null,
        nominee_dob: nomineeForm.nominee_dob || null
      };
      if (editingNomineeId) {
        const { data, error: upErr } = await supabase
          .from('customer_nominees')
          .update(payload)
          .eq('id', editingNomineeId)
          .eq('customer_id', selectedId)
          .select('id,nominee_name,relationship,nominee_dob')
          .single();
        if (upErr) throw upErr;
        const row = data as NomineeRow;
        setNominees((prev) =>
          prev.map((n) => (n.id === row.id ? row : n))
        );
      } else {
        const { data, error: insErr } = await supabase
          .from('customer_nominees')
          .insert({ customer_id: selectedId, ...payload })
          .select('id,nominee_name,relationship,nominee_dob')
          .single();
        if (insErr) throw insErr;
        const row = data as NomineeRow;
        setNominees((prev) => [row, ...prev]);
      }
      setNomineeFormOpen(false);
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to save nominee'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  async function deleteNominee(id: string) {
    if (!selectedId) return;
    if (!window.confirm('Remove this nominee?')) return;
    setExtrasSaving(true);
        try {
      const { error: delErr } = await supabase
        .from('customer_nominees')
        .delete()
        .eq('id', id)
        .eq('customer_id', selectedId);
      if (delErr) throw delErr;
      setNominees((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to remove nominee'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  function openBankCreate() {
        setEditingBankId(null);
    setBankForm({
      bank_name: '',
      account_no: '',
      ifsc: '',
      branch: ''
    });
    setBankFormOpen(true);
  }

  function openBankEdit(row: BankRow) {
        setEditingBankId(row.id);
    setBankForm({
      bank_name: row.bank_name ?? '',
      account_no: row.account_no ?? '',
      ifsc: row.ifsc ?? '',
      branch: row.branch ?? ''
    });
    setBankFormOpen(true);
  }

  async function saveBank() {
    if (!selectedId) return;
    const bankName = bankForm.bank_name.trim();
    if (!bankName) {
      pageError('Bank name is required.');
      return;
    }
    setExtrasSaving(true);
        try {
      const payload = {
        bank_name: bankName,
        account_no: bankForm.account_no.trim() || null,
        ifsc: bankForm.ifsc.trim() || null,
        branch: bankForm.branch.trim() || null
      };
      if (editingBankId) {
        const { data, error: upErr } = await supabase
          .from('customer_bank_details')
          .update(payload)
          .eq('id', editingBankId)
          .eq('customer_id', selectedId)
          .select('id,bank_name,account_no,ifsc,branch')
          .single();
        if (upErr) throw upErr;
        const row = data as BankRow;
        setBankRows((prev) =>
          prev.map((b) => (b.id === row.id ? row : b))
        );
      } else {
        const { data, error: insErr } = await supabase
          .from('customer_bank_details')
          .insert({ customer_id: selectedId, ...payload })
          .select('id,bank_name,account_no,ifsc,branch')
          .single();
        if (insErr) throw insErr;
        const row = data as BankRow;
        setBankRows((prev) => [row, ...prev]);
      }
      setBankFormOpen(false);
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to save bank details'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  async function deleteBank(id: string) {
    if (!selectedId) return;
    if (!window.confirm('Remove this bank record?')) return;
    setExtrasSaving(true);
        try {
      const { error: delErr } = await supabase
        .from('customer_bank_details')
        .delete()
        .eq('id', id)
        .eq('customer_id', selectedId);
      if (delErr) throw delErr;
      setBankRows((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to remove bank record'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  function openKycUpload() {
            setKycDocType('aadhaar');
    setKycPanInput(selected?.pan_number ?? '');
    setKycAadhaarInput(selected?.aadhaar_last4 ?? '');
    if (kycFileRef.current) kycFileRef.current.value = '';
    setKycFormOpen(true);
  }

  async function persistCustomerIdentifiers(
    pan: string,
    aadhaarLast4: string
  ): Promise<CustomerRow | null> {
    if (!selectedId) return null;
    const panNorm = normalizePan(pan);
    const a4 = normalizeAadhaarLast4(aadhaarLast4);
    const { data, error: upErr } = await supabase
      .from('customers')
      .update({
        pan_number: panNorm || null,
        aadhaar_last4: a4 || null
      })
      .eq('id', selectedId)
      .select(CUSTOMER_SELECT)
      .single();
    if (upErr) throw upErr;
    const row = data as CustomerRow;
    setCustomers((cs) => cs.map((c) => (c.id === row.id ? row : c)));
    setPinnedCustomer((p) => (p?.id === row.id ? row : p));
    setIdentityPan(row.pan_number ?? '');
    setIdentityAadhaar(row.aadhaar_last4 ?? '');
    return row;
  }

  async function saveKycIdentityDetails() {
    setExtrasSaving(true);
        try {
      await persistCustomerIdentifiers(identityPan, identityAadhaar);
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to save PAN / Aadhaar'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  async function uploadKycDocument() {
    if (!selectedId) return;
    const file = kycFileRef.current?.files?.[0];
    if (!file) {
      pageError('Choose a file to upload.');
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      pageError('File is too large (max 50 MB).');
      return;
    }

    setExtrasSaving(true);
        
    const ext = extensionFromFile(file);
    const path = `customer/${selectedId}/${kycDocType}/${crypto.randomUUID()}${ext}`;

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

      const { data: row, error: insErr } = await supabase
        .from('customer_kyc_documents')
        .insert({
          customer_id: selectedId,
          doc_type: kycDocType,
          storage_path: path,
          uploaded_by: user?.id ?? null,
          verified_status: 'Pending'
        })
        .select('id,doc_type,verified_status,uploaded_at,storage_path')
        .single();

      if (insErr) {
        await supabase.storage.from(KYC_BUCKET).remove([path]);
        throw insErr;
      }

      setKycDocs((prev) => [row as KycDocRow, ...prev]);

      const panToSave =
        kycDocType === 'pan' ? kycPanInput : selected?.pan_number ?? '';
      const aadhaarToSave =
        kycDocType === 'aadhaar'
          ? kycAadhaarInput
          : selected?.aadhaar_last4 ?? '';
      if (panToSave.trim() || aadhaarToSave.trim()) {
        try {
          await persistCustomerIdentifiers(panToSave, aadhaarToSave);
        } catch (e) {
          pageError(
            e instanceof Error
              ? e.message
              : 'Document uploaded but failed to save PAN / Aadhaar on customer'
          );
        }
      }

      setKycFormOpen(false);
      if (kycFileRef.current) kycFileRef.current.value = '';
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to upload document'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  async function openKycFile(doc: KycDocRow) {
        try {
      const { data, error: urlErr } = await supabase.storage
        .from(KYC_BUCKET)
        .createSignedUrl(doc.storage_path, 3600);
      if (urlErr || !data?.signedUrl) {
        throw urlErr ?? new Error('No download URL');
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Could not open the file'
      );
    }
  }

  async function deleteKycDoc(doc: KycDocRow) {
    if (!selectedId) return;
    if (
      !window.confirm(
        'Remove this document from the record and delete the stored file?'
      )
    ) {
      return;
    }
    setExtrasSaving(true);
        try {
      const { error: delErr } = await supabase
        .from('customer_kyc_documents')
        .delete()
        .eq('id', doc.id)
        .eq('customer_id', selectedId);
      if (delErr) throw delErr;
      await supabase.storage.from(KYC_BUCKET).remove([doc.storage_path]);
      setKycDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Failed to remove document'
      );
    } finally {
      setExtrasSaving(false);
    }
  }

  const extrasDialogOpen =
    addressFormOpen || nomineeFormOpen || bankFormOpen || kycFormOpen;

  const listShownCount = listTotal ?? customers.length;

  return (
    <div className="grid min-h-[28rem] grid-cols-[260px_1fr] items-start gap-4">
      <Card className="sticky top-4 flex max-h-[calc(100dvh-10.75rem)] min-h-[28rem] flex-col gap-3 overflow-hidden p-3">
        <div className="flex shrink-0 items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Customers</div>
            <div className="text-xs text-gray-500">
              {loading
                ? 'Loading…'
                : searchQuery
                  ? `${customers.length} of ${listShownCount} shown`
                  : `${listShownCount} shown`}
            </div>
          </div>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                                setDraftFieldErrors({});
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">Add</Button>
            </DialogTrigger>
            <DialogContent className={CUSTOMER_FORM_DIALOG_CLASS}>
              <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
                <DialogTitle>Add customer</DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Full name *</Label>
                  <Input
                    value={draft.full_name}
                    aria-invalid={draftFieldErrors.full_name ? true : undefined}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, full_name: e.target.value }));
                      if (draftFieldErrors.full_name) {
                        setDraftFieldErrors((fe) => {
                          const { full_name: _, ...rest } = fe;
                          return rest;
                        });
                      }
                    }}
                    placeholder="e.g. Mr. Amit Deshmukh"
                  />
                  <FieldError message={draftFieldErrors.full_name} />
                </div>
                <PhoneInputField
                  value={draft.phone}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, phone: v }));
                    if (draftFieldErrors.phone) {
                      setDraftFieldErrors((fe) => {
                        const { phone: _, ...rest } = fe;
                        return rest;
                      });
                    }
                  }}
                  label="Phone *"
                  error={draftFieldErrors.phone}
                />
                <EmailInputField
                  value={draft.email}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, email: v }));
                    if (draftFieldErrors.email) {
                      setDraftFieldErrors((fe) => {
                        const { email: _, ...rest } = fe;
                        return rest;
                      });
                    }
                  }}
                  placeholder="name@email.com"
                  error={draftFieldErrors.email}
                />
                <div>
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={draft.dob}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, dob: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Occupation</Label>
                  <Input
                    value={draft.occupation}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, occupation: e.target.value }))
                    }
                    placeholder="Salaried / Business…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Nationality</Label>
                  <Select
                    value={draft.nationality}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, nationality: v }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Indian">Indian</SelectItem>
                      <SelectItem value="NRI">NRI</SelectItem>
                      <SelectItem value="Foreign National">
                        Foreign National
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Father&apos;s / mother&apos;s / spouse&apos;s name</Label>
                  <Input
                    value={draft.guardian_name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, guardian_name: e.target.value }))
                    }
                    placeholder="As on PAN / Aadhaar"
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Residential status</Label>
                  <Select
                    value={draft.residential_status}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, residential_status: v }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESIDENTIAL_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Passport no. (NRI / foreign)</Label>
                  <Input
                    value={draft.passport_number}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, passport_number: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Office name &amp; address</Label>
                  <Textarea
                    value={draft.office_name_address}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        office_name_address: e.target.value
                      }))
                    }
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void createCustomer()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Input
          className="shrink-0"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search…"
        />

        <div
          ref={listScrollRef}
          className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3"
        >
          <div className="flex flex-col gap-1">
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer(c)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  selectedId === c.id
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="line-clamp-1 text-sm font-semibold text-gray-900">
                  {c.full_name}
                </div>
                <div className="line-clamp-1 text-xs text-gray-500">
                  {c.phone ?? '—'}
                </div>
              </button>
            ))}
            {!loading && customers.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No customers found.
              </div>
            ) : null}
            <div ref={loadMoreSentinelRef} className="h-1 shrink-0" aria-hidden />
            {loadingMore ? (
              <div className="py-3 text-center text-xs text-gray-500">
                Loading more…
              </div>
            ) : null}
          </div>
        </div>

        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => void fetchCustomerList({ reset: true })}
          disabled={loading || loadingMore}
        >
          Refresh
        </Button>
      </Card>

      <Card className="p-5">
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 pb-4">
              <div
                className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 border-blue-200 bg-blue-50 text-lg font-bold text-blue-600"
                aria-hidden
              >
                {initialsFromName(selected.full_name)}
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900">
                  {selected.full_name}
                </div>
                <div className="text-sm text-gray-500">{selected.id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {latestInquiry ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        String(latestInquiry.lead_source || '').toLowerCase() ===
                        'broker'
                          ? 'border border-teal-200 bg-teal-50 text-teal-800'
                          : 'border border-gray-200 bg-gray-50 text-gray-700'
                      }`}
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

                <Dialog
                  open={editOpen}
                  onOpenChange={(next) => {
                    setEditOpen(next);
                    if (!next) {
                                            setEditFieldErrors({});
                    }
                  }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={openEditDialog}
                  >
                    Edit
                  </Button>
                  <DialogContent className={CUSTOMER_FORM_DIALOG_CLASS}>
                    <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
                      <DialogTitle>Edit customer</DialogTitle>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label>Full name *</Label>
                        <Input
                          value={editDraft.full_name}
                          aria-invalid={
                            editFieldErrors.full_name ? true : undefined
                          }
                          onChange={(e) => {
                            setEditDraft((d) => ({
                              ...d,
                              full_name: e.target.value
                            }));
                            if (editFieldErrors.full_name) {
                              setEditFieldErrors((fe) => {
                                const { full_name: _, ...rest } = fe;
                                return rest;
                              });
                            }
                          }}
                          placeholder="e.g. Mr. Amit Deshmukh"
                        />
                        <FieldError message={editFieldErrors.full_name} />
                      </div>
                      <PhoneInputField
                        value={editDraft.phone}
                        onChange={(v) => {
                          setEditDraft((d) => ({ ...d, phone: v }));
                          if (editFieldErrors.phone) {
                            setEditFieldErrors((fe) => {
                              const { phone: _, ...rest } = fe;
                              return rest;
                            });
                          }
                        }}
                        label="Phone *"
                        error={editFieldErrors.phone}
                      />
                      <EmailInputField
                        value={editDraft.email}
                        onChange={(v) => {
                          setEditDraft((d) => ({ ...d, email: v }));
                          if (editFieldErrors.email) {
                            setEditFieldErrors((fe) => {
                              const { email: _, ...rest } = fe;
                              return rest;
                            });
                          }
                        }}
                        placeholder="name@email.com"
                        error={editFieldErrors.email}
                      />
                      <div>
                        <Label>Date of birth</Label>
                        <Input
                          type="date"
                          value={editDraft.dob}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              dob: e.target.value
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Occupation</Label>
                        <Input
                          value={editDraft.occupation}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              occupation: e.target.value
                            }))
                          }
                          placeholder="Salaried / Business…"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Nationality</Label>
                        <Select
                          value={editDraft.nationality}
                          onValueChange={(v) =>
                            setEditDraft((d) => ({
                              ...d,
                              nationality: v
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Indian">Indian</SelectItem>
                            <SelectItem value="NRI">NRI</SelectItem>
                            <SelectItem value="Foreign National">
                              Foreign National
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Father&apos;s / mother&apos;s / spouse&apos;s name</Label>
                        <Input
                          value={editDraft.guardian_name}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              guardian_name: e.target.value
                            }))
                          }
                          placeholder="As on PAN / Aadhaar"
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Residential status</Label>
                        <Select
                          value={editDraft.residential_status}
                          onValueChange={(v) =>
                            setEditDraft((d) => ({
                              ...d,
                              residential_status: v
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RESIDENTIAL_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Passport no. (NRI / foreign)</Label>
                        <Input
                          value={editDraft.passport_number}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              passport_number: e.target.value
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Office name &amp; address</Label>
                        <Textarea
                          value={editDraft.office_name_address}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              office_name_address: e.target.value
                            }))
                          }
                          rows={2}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>PAN</Label>
                        <Input
                          value={editDraft.pan_number}
                          aria-invalid={
                            editFieldErrors.pan_number ? true : undefined
                          }
                          onChange={(e) => {
                            setEditDraft((d) => ({
                              ...d,
                              pan_number: e.target.value.toUpperCase()
                            }));
                            if (editFieldErrors.pan_number) {
                              setEditFieldErrors((fe) => {
                                const { pan_number: _, ...rest } = fe;
                                return rest;
                              });
                            }
                          }}
                          placeholder="ABCDE1234F"
                          className="mt-1 uppercase"
                        />
                        <FieldError message={editFieldErrors.pan_number} />
                      </div>
                      <div>
                        <Label>Aadhaar (last 4)</Label>
                        <Input
                          value={editDraft.aadhaar_last4}
                          maxLength={4}
                          aria-invalid={
                            editFieldErrors.aadhaar_last4 ? true : undefined
                          }
                          onChange={(e) => {
                            setEditDraft((d) => ({
                              ...d,
                              aadhaar_last4: e.target.value
                                .replace(/\D/g, '')
                                .slice(0, 4)
                            }));
                            if (editFieldErrors.aadhaar_last4) {
                              setEditFieldErrors((fe) => {
                                const { aadhaar_last4: _, ...rest } = fe;
                                return rest;
                              });
                            }
                          }}
                          placeholder="1234"
                          className="mt-1"
                        />
                        <FieldError message={editFieldErrors.aadhaar_last4} />
                      </div>
                    </div>
                    </div>

                    <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
                      <Button
                        variant="outline"
                        onClick={() => setEditOpen(false)}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void updateCustomer()}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
              {DETAIL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={`shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors ${
                    detailTab === t.id
                      ? 'border border-b-0 border-gray-200 bg-white text-blue-600'
                      : 'border border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'profile' ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-white">
                  <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-700">
                    Contact & identity
                  </div>
                  <div className="px-4 py-1">
                    <InfoRow label="Phone" value={selected.phone ?? '—'} />
                    <InfoRow label="Email" value={selected.email ?? '—'} />
                    <InfoRow
                      label="Date of birth"
                      value={selected.dob ?? '—'}
                    />
                    <InfoRow
                      label="Occupation"
                      value={selected.occupation ?? '—'}
                    />
                    <InfoRow
                      label="Nationality"
                      value={selected.nationality ?? '—'}
                    />
                    <InfoRow
                      label="Father / mother / spouse"
                      value={selected.guardian_name ?? '—'}
                    />
                    <InfoRow
                      label="Residential status"
                      value={selected.residential_status ?? '—'}
                    />
                    <InfoRow
                      label="Passport no."
                      value={selected.passport_number ?? '—'}
                    />
                    <InfoRow
                      label="Office name & address"
                      value={selected.office_name_address ?? '—'}
                    />
                    <InfoRow
                      label="PAN"
                      value={selected.pan_number ?? '—'}
                    />
                    <InfoRow
                      label="Aadhaar"
                      value={
                        selected.aadhaar_last4
                          ? maskAadhaarLast4(selected.aadhaar_last4)
                          : '—'
                      }
                    />
                    <InfoRow
                      label="Customer since"
                      value={new Date(selected.created_at).toLocaleString()}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Sales inquiries
                  </div>
                  <div className="text-xs text-gray-500">
                    Per-project leads; broker appears when source is Broker.
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                          <th className="px-3 py-2 font-medium">When</th>
                          <th className="px-3 py-2 font-medium">Project</th>
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Broker</th>
                          <th className="px-3 py-2 font-medium">Interest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingInquiries ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              Loading…
                            </td>
                          </tr>
                        ) : customerInquiries.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              No inquiries yet.
                            </td>
                          </tr>
                        ) : (
                          customerInquiries.map((row) => {
                            const u = embedOne(row.units);
                            const brokerNm = embedOne(row.brokers)?.full_name;
                            const showBroker =
                              String(row.lead_source || '').toLowerCase() ===
                              'broker';
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-gray-100"
                              >
                                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                                  {new Date(row.created_at).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-gray-900">
                                  {embedOne(row.projects)?.name ?? '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-900">
                                  {u
                                    ? `${u.unit_code} · ${u.wing_name}`
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {row.lead_source}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {showBroker ? brokerNm ?? '—' : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {row.interested_in ?? '—'}
                                </td>
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

            {detailTab === 'kyc' ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        PAN &amp; Aadhaar
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Saved on the customer record when KYC is completed. Used on
                        booking application forms.
                      </p>
                    </div>
                    {customerKycComplete ? (
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
                        KYC complete
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>PAN</Label>
                      <Input
                        value={identityPan}
                        onChange={(e) =>
                          setIdentityPan(e.target.value.toUpperCase())
                        }
                        placeholder="ABCDE1234F"
                        className="mt-1 uppercase"
                      />
                    </div>
                    <div>
                      <Label>Aadhaar (last 4)</Label>
                      <Input
                        value={identityAadhaar}
                        maxLength={4}
                        onChange={(e) =>
                          setIdentityAadhaar(
                            e.target.value.replace(/\D/g, '').slice(0, 4)
                          )
                        }
                        placeholder="1234"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={() => void saveKycIdentityDetails()}
                    disabled={extrasSaving}
                  >
                    {extrasSaving ? 'Saving…' : 'Save to customer'}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    KYC documents
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openKycUpload}
                    disabled={extrasSaving || loadingExtras}
                  >
                    Upload document
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      Loading…
                    </div>
                  ) : kycDocs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      No documents yet. Upload a PDF or image (max 50 MB).
                      Files are stored in the private{' '}
                      <code className="text-xs">kyc</code> bucket.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                            <th className="px-3 py-2 font-medium">Document</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Uploaded</th>
                            <th className="px-3 py-2 font-medium text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {kycDocs.map((d) => (
                            <tr
                              key={d.id}
                              className="border-b border-gray-100"
                            >
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {d.doc_type}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {d.verified_status}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                                {new Date(d.uploaded_at).toLocaleString()}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void openKycFile(d)}
                                    disabled={
                                      extrasSaving || !d.storage_path
                                    }
                                  >
                                    Open
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void deleteKycDoc(d)}
                                    disabled={extrasSaving}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <Dialog
                  open={kycFormOpen}
                  onOpenChange={(next) => {
                    setKycFormOpen(next);
                  }}
                >
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Upload KYC document</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4">
                      <div>
                        <Label>Document type</Label>
                        <Select
                          value={kycDocType}
                          onValueChange={(v) => {
                            setKycDocType(v);
                            if (v === 'pan') setKycPanInput(selected?.pan_number ?? '');
                            if (v === 'aadhaar')
                              setKycAadhaarInput(selected?.aadhaar_last4 ?? '');
                          }}
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {KYC_DOC_TYPES.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {kycDocType === 'pan' ? (
                        <div>
                          <Label>PAN number</Label>
                          <Input
                            value={kycPanInput}
                            onChange={(e) =>
                              setKycPanInput(e.target.value.toUpperCase())
                            }
                            placeholder="ABCDE1234F"
                            className="mt-1 uppercase"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Stored on the customer profile when you upload.
                          </p>
                        </div>
                      ) : null}
                      {kycDocType === 'aadhaar' ? (
                        <div>
                          <Label>Aadhaar (last 4 digits)</Label>
                          <Input
                            value={kycAadhaarInput}
                            maxLength={4}
                            onChange={(e) =>
                              setKycAadhaarInput(
                                e.target.value.replace(/\D/g, '').slice(0, 4)
                              )
                            }
                            placeholder="1234"
                            className="mt-1"
                          />
                        </div>
                      ) : null}
                      <div>
                        <Label>File</Label>
                        <Input
                          ref={kycFileRef}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="mt-1 block h-auto py-1.5 text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Path:{' '}
                          <code className="text-[11px]">
                            customer/&lt;id&gt;/&lt;type&gt;/&lt;uuid&gt;
                          </code>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setKycFormOpen(false)}
                        disabled={extrasSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void uploadKycDocument()}
                        disabled={extrasSaving}
                      >
                        {extrasSaving ? 'Uploading…' : 'Upload'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}

            {detailTab === 'address' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Addresses
                    </div>
                    <p className="text-xs text-gray-500">
                      Current → communication address; permanent → application
                      form permanent address.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openAddressCreate}
                    disabled={extrasSaving || loadingExtras}
                  >
                    Add address
                  </Button>
                </div>

                {loadingExtras ? (
                  <div className="text-sm text-gray-500">Loading…</div>
                ) : addresses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No address saved for this customer.
                  </div>
                ) : (
                  addresses.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          {a.kind === 'permanent' ? 'Permanent' : 'Current'}{' '}
                          address
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openAddressEdit(a)}
                            disabled={extrasSaving}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void deleteAddress(a.id)}
                            disabled={extrasSaving}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-900">
                        <div>{a.address_line1 ?? '—'}</div>
                        <div className="text-gray-600">
                          {[a.city, a.state, a.pin].filter(Boolean).join(', ') ||
                            '—'}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <Dialog
                  open={addressFormOpen}
                  onOpenChange={(next) => {
                    setAddressFormOpen(next);
                  }}
                >
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingAddressId ? 'Edit address' : 'Add address'}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Type</Label>
                        <Select
                          value={addressForm.kind}
                          onValueChange={(v) =>
                            setAddressForm((f) => ({
                              ...f,
                              kind: v as 'current' | 'permanent'
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="current">Current</SelectItem>
                            <SelectItem value="permanent">Permanent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>Address line</Label>
                        <Textarea
                          value={addressForm.address_line1}
                          onChange={(e) =>
                            setAddressForm((f) => ({
                              ...f,
                              address_line1: e.target.value
                            }))
                          }
                          rows={2}
                          placeholder="Street, building, landmark…"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={addressForm.city}
                          onChange={(e) =>
                            setAddressForm((f) => ({
                              ...f,
                              city: e.target.value
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={addressForm.state}
                          onChange={(e) =>
                            setAddressForm((f) => ({
                              ...f,
                              state: e.target.value
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>PIN</Label>
                        <Input
                          value={addressForm.pin}
                          onChange={(e) =>
                            setAddressForm((f) => ({
                              ...f,
                              pin: e.target.value
                            }))
                          }
                          placeholder="e.g. 400001"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setAddressFormOpen(false)}
                        disabled={extrasSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void saveAddress()}
                        disabled={extrasSaving}
                      >
                        {extrasSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}

            {detailTab === 'nominee' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    Nominees
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openNomineeCreate}
                    disabled={extrasSaving || loadingExtras}
                  >
                    Add nominee
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      Loading…
                    </div>
                  ) : nominees.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      No nominee records.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {nominees.map((n) => (
                        <div
                          key={n.id}
                          className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">
                              {n.nominee_name ?? '—'}
                            </div>
                            <div className="mt-1 text-xs text-gray-600">
                              {n.relationship ?? '—'} · DOB{' '}
                              {n.nominee_dob
                                ? new Date(n.nominee_dob).toLocaleDateString()
                                : '—'}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openNomineeEdit(n)}
                              disabled={extrasSaving}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => void deleteNominee(n.id)}
                              disabled={extrasSaving}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Dialog
                  open={nomineeFormOpen}
                  onOpenChange={(next) => {
                    setNomineeFormOpen(next);
                  }}
                >
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingNomineeId ? 'Edit nominee' : 'Add nominee'}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Full name</Label>
                        <Input
                          value={nomineeForm.nominee_name}
                          onChange={(e) =>
                            setNomineeForm((f) => ({
                              ...f,
                              nominee_name: e.target.value
                            }))
                          }
                          placeholder="Nominee name"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Relationship</Label>
                        <Input
                          value={nomineeForm.relationship}
                          onChange={(e) =>
                            setNomineeForm((f) => ({
                              ...f,
                              relationship: e.target.value
                            }))
                          }
                          placeholder="e.g. Spouse, Father"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Date of birth</Label>
                        <Input
                          type="date"
                          value={nomineeForm.nominee_dob}
                          onChange={(e) =>
                            setNomineeForm((f) => ({
                              ...f,
                              nominee_dob: e.target.value
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setNomineeFormOpen(false)}
                        disabled={extrasSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void saveNominee()}
                        disabled={extrasSaving}
                      >
                        {extrasSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}

            {detailTab === 'bank' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    Bank accounts
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openBankCreate}
                    disabled={extrasSaving || loadingExtras}
                  >
                    Add bank
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  {loadingExtras ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      Loading…
                    </div>
                  ) : bankRows.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      No bank details on file.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {bankRows.map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">
                              {b.bank_name ?? '—'}
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                              <div>Account: {b.account_no ?? '—'}</div>
                              <div>IFSC: {b.ifsc ?? '—'}</div>
                              <div className="sm:col-span-2">
                                Branch: {b.branch ?? '—'}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openBankEdit(b)}
                              disabled={extrasSaving}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => void deleteBank(b.id)}
                              disabled={extrasSaving}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Dialog
                  open={bankFormOpen}
                  onOpenChange={(next) => {
                    setBankFormOpen(next);
                  }}
                >
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingBankId ? 'Edit bank details' : 'Add bank details'}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Bank name</Label>
                        <Input
                          value={bankForm.bank_name}
                          onChange={(e) =>
                            setBankForm((f) => ({
                              ...f,
                              bank_name: e.target.value
                            }))
                          }
                          placeholder="Bank name"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Account number</Label>
                        <Input
                          value={bankForm.account_no}
                          onChange={(e) =>
                            setBankForm((f) => ({
                              ...f,
                              account_no: e.target.value
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>IFSC</Label>
                        <Input
                          value={bankForm.ifsc}
                          onChange={(e) =>
                            setBankForm((f) => ({
                              ...f,
                              ifsc: e.target.value
                            }))
                          }
                          placeholder="IFSC code"
                        />
                      </div>
                      <div>
                        <Label>Branch</Label>
                        <Input
                          value={bankForm.branch}
                          onChange={(e) =>
                            setBankForm((f) => ({
                              ...f,
                              branch: e.target.value
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setBankFormOpen(false)}
                        disabled={extrasSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void saveBank()}
                        disabled={extrasSaving}
                      >
                        {extrasSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a customer.</div>
        )}
      </Card>
    </div>
  );
}
