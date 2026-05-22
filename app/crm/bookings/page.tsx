'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useRouter } from 'next/navigation';
import { pageError } from '@/lib/toast';
import { Check, ChevronDown, Search, Sparkles, UserPlus, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import {
  PaymentCostOverview,
  type PaymentCostOverviewMode
} from '../_components/payment-cost-overview';
import {
  isUnitAvailableForBooking,
  isUnitPrefillableFromInquiry,
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
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
  computeBookingCostBreakdown,
  formatProjectParkingSummary,
  type ProjectParkingMeta,
  type ProjectPricingMeta
} from '../booking-cost-utils';
import { formatInr, formatInrCompactLacCr, unitAgreementTotalInr, unitBillableAreaSqft } from '../inr-format';
import { formatFloorLabel } from '../inventory/inventory-utils';
import {
  negotiatedPriceFromInquiryStage,
  resolveBookingFinancialTotal
} from '../booking-financial-total';
import {
  readConsumeBookingPrefill,
  type BookingPrefillV1
} from '../booking-prefill-storage';
import { loadInquiryStageData } from '../inquiry/inquiry-stage-store';
import { negotiationApprovalBlockMessage } from '../inquiry/inquiry-stage-transitions';
import { BookingListTable } from './booking-list-table';
import type { BookingListRow } from './booking-types';

type UnitOption = {
  id: string;
  project_id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rate: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included: number | null;
  status: string;
};

type CustomerOption = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type CoBuyerStored = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type PaymentDetailStored = {
  utr?: string;
  cheque_number?: string;
  neft_ref?: string;
};

type CoBuyerSlot = { key: string; customerId: string };

function normalizePhoneDigits(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

function newCoBuyerSlot(): CoBuyerSlot {
  return { key: crypto.randomUUID(), customerId: '' };
}

const PAYMENT_MODE_OPTIONS = [
  'Cash',
  'UPI',
  'Cheque',
  'NEFT/RTGS',
  'Card',
  'Down Payment',
  'Home Loan',
  'Construction Linked'
] as const;

const LOAN_BANK_OPTIONS = [
  'HDFC Bank',
  'SBI Bank',
  'Axis Bank',
  'ICICI Bank',
  'Bank of Baroda'
] as const;

function paymentModeNeedsLoanBank(mode: string | null | undefined) {
  const m = String(mode || '').trim();
  return m === 'Home Loan' || m === 'Construction Linked';
}

function parsePaymentDetailStored(raw: unknown): PaymentDetailStored | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: PaymentDetailStored = {};
  if (typeof o.utr === 'string' && o.utr.trim()) out.utr = o.utr.trim();
  if (typeof o.cheque_number === 'string' && o.cheque_number.trim()) {
    out.cheque_number = o.cheque_number.trim();
  }
  if (typeof o.neft_ref === 'string' && o.neft_ref.trim()) {
    out.neft_ref = o.neft_ref.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

function formatBookingPaymentDisplay(
  mode: string | null,
  loanBank: string | null,
  detail: PaymentDetailStored | null
) {
  const m = mode ?? '—';
  if (paymentModeNeedsLoanBank(mode) && loanBank) {
    return `${m} · ${loanBank}`;
  }
  if (mode === 'UPI' && detail?.utr) return `${m} · UTR ${detail.utr}`;
  if (mode === 'Cheque' && detail?.cheque_number) {
    return `${m} · Chq ${detail.cheque_number}`;
  }
  if (mode === 'NEFT/RTGS' && detail?.neft_ref) {
    return `${m} · Ref ${detail.neft_ref}`;
  }
  return m;
}

function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

function normalizeSearch(s: string) {
  return s.trim().toLowerCase();
}

function SearchablePicker<T extends { id: string }>({
  label,
  itemCount,
  items,
  selectedId,
  onSelect,
  emptyMessage,
  emptyFooter,
  searchTrailing,
  searchPlaceholder,
  triggerPlaceholder,
  matchItem,
  renderTriggerSummary,
  renderRow
}: {
  label: string;
  itemCount: number;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyMessage: string;
  emptyFooter?: (ctx: {
    query: string;
    closePopover: () => void;
  }) => ReactNode;
  searchTrailing?: (ctx: {
    query: string;
    closePopover: () => void;
  }) => ReactNode;
  searchPlaceholder: string;
  triggerPlaceholder: string;
  matchItem: (item: T, query: string) => boolean;
  renderTriggerSummary: (item: T) => ReactNode;
  renderRow: (item: T) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = items.find((x) => x.id === selectedId) ?? null;
  const q = normalizeSearch(query);

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((item) => matchItem(item, q));
  }, [items, q, matchItem]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  return (
    <div className="space-y-1.5">
      <Label>
        {label}{' '}
        <span className="font-normal text-muted-foreground">({itemCount})</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex gap-2">
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-auto min-h-10 w-full flex-1 justify-between px-3 py-2 text-left font-normal"
            >
              <span className="min-w-0 flex-1 truncate">
                {selected ? (
                  renderTriggerSummary(selected)
                ) : (
                  <span className="text-muted-foreground">
                    {triggerPlaceholder}
                  </span>
                )}
              </span>
              <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          {selected ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              title="Clear"
              onClick={(e) => {
                e.preventDefault();
                onSelect('');
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <PopoverContent
          className="w-[min(calc(100vw-2rem),28rem)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex min-h-11 items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {searchTrailing
              ? searchTrailing({
                query,
                closePopover: () => setOpen(false)
              })
              : null}
          </div>
          <div
            className="max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain p-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div className="space-y-3 px-3 py-6 text-center text-sm text-muted-foreground">
                <div>{emptyMessage}</div>
                {emptyFooter && normalizeSearch(query)
                  ? emptyFooter({ query, closePopover: () => setOpen(false) })
                  : null}
              </div>
            ) : (
              filtered.map((item) => {
                const isSel = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors',
                      'hover:bg-accent focus-visible:bg-accent',
                      isSel && 'bg-accent'
                    )}
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        isSel ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">{renderRow(item)}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function BookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [bookings, setBookings] = useState<BookingListRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [unitId, setUnitId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [coBuyerSlots, setCoBuyerSlots] = useState<CoBuyerSlot[]>([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [loanBank, setLoanBank] = useState('');
  const [upiUtr, setUpiUtr] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [neftRef, setNeftRef] = useState('');
  const [bookingAmount, setBookingAmount] = useState('500000');

  const [creating, setCreating] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  const [prefillMeta, setPrefillMeta] = useState<BookingPrefillV1 | null>(null);
  const [inquiryNegotiatedPrice, setInquiryNegotiatedPrice] = useState<
    number | null
  >(null);
  const [inquiryBookingBlockMessage, setInquiryBookingBlockMessage] = useState<
    string | null
  >(null);
  const [breakdownUnit, setBreakdownUnit] = useState<UnitOption | null>(null);
  const [unitFromInquiryUnavailable, setUnitFromInquiryUnavailable] =
    useState(false);
  const [projectParking, setProjectParking] = useState<ProjectParkingMeta | null>(
    null
  );
  const [projectPricing, setProjectPricing] = useState<ProjectPricingMeta | null>(
    null
  );

  const [prefillCustomerMissing, setPrefillCustomerMissing] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addCustomerCoSlotKey, setAddCustomerCoSlotKey] = useState<string | null>(
    null
  );
  const [newCustomerDraft, setNewCustomerDraft] = useState({
    full_name: '',
    phone: '',
    email: ''
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  async function loadProjectPricing(projectId: string) {
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .select(
        'parking_slots,parking_rate,pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
      )
      .eq('id', projectId)
      .maybeSingle();
    if (projErr) pageError(projErr.message);
    setProjectParking(
      projData
        ? {
            parking_slots: projData.parking_slots ?? null,
            parking_rate: projData.parking_rate ?? null
          }
        : null
    );
    const pd = projData as Record<string, unknown> | null;
    setProjectPricing(
      pd
        ? {
            gst_registered: Boolean(pd.pricing_gst_registered),
            gst_percent: Number(pd.pricing_gst_percent) || 0,
            stamp_duty_percent: Number(pd.pricing_stamp_duty_percent) || 0,
            registration_fee: Number(pd.pricing_registration_fee) || 0
          }
        : null
    );
  }

  async function load() {
    setLoading(true);
        setPrefillCustomerMissing(false);

    const [
      { data: uData, error: uErr },
      { data: cData, error: cErr },
      { data: bkData, error: bkErr }
    ] = await Promise.all([
      supabase
        .from('units')
        .select(
          'id,unit_code,wing_name,floor,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,parking_slots_included,status,project_id'
        )
        .in('status', ['AVAILABLE', 'A', 'TOKEN'])
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(2000),
      supabase
        .from('customers')
        .select('id,full_name,phone,email')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('bookings')
        .select(
          `
          id,
          project_id,
          unit_id,
          customer_id,
          created_at,
          updated_at,
          stage,
          workflow_stage,
          status,
          payment_mode,
          loan_bank,
          payment_detail,
          booking_amount,
          co_buyers,
          units ( unit_code, wing_name, floor, unit_type, status ),
          customers ( full_name, phone )
        `
        )
        .order('created_at', { ascending: false })
        .limit(200)
    ]);

    if (uErr) pageError(uErr.message);
    if (cErr) pageError(cErr.message);
    if (bkErr) pageError(bkErr.message);

    let unitsList = (uData ?? []) as UnitOption[];
    let customerList = (cData ?? []) as CustomerOption[];

    const p = readConsumeBookingPrefill();
    if (p) {
      setPrefillMeta(p);
      if (p.customerId) {
        const { data: custRow } = await supabase
          .from('customers')
          .select('id,full_name,phone,email')
          .eq('id', p.customerId)
          .maybeSingle();
        if (custRow) {
          setCustomerId(p.customerId);
          if (
            !customerList.some((c) => c.id === (custRow as CustomerOption).id)
          ) {
            customerList = [custRow as CustomerOption, ...customerList];
          }
        } else {
          setCustomerId('');
          setPrefillCustomerMissing(true);
        }
      } else {
        setCustomerId('');
      }

      const unitSelect =
        'id,unit_code,wing_name,floor,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,parking_slots_included,status,project_id';

      let prefillUnit = unitsList.find((u) => u.id === p.unitId);
      if (!prefillUnit && p.unitId) {
        const { data: urow } = await supabase
          .from('units')
          .select(unitSelect)
          .eq('id', p.unitId)
          .maybeSingle();
        if (urow) {
          const row = urow as UnitOption;
          if (isUnitPrefillableFromInquiry(row.status)) {
            unitsList = [row, ...unitsList];
            prefillUnit = row;
          } else {
            setBreakdownUnit(row);
            if (row.project_id) void loadProjectPricing(row.project_id);
          }
        }
      }

      const prefillSelectable =
        prefillUnit && isUnitPrefillableFromInquiry(prefillUnit.status);

      if (prefillSelectable) {
        setUnitId(p.unitId);
        setUnitFromInquiryUnavailable(false);
        setBreakdownUnit(null);
      } else {
        setUnitFromInquiryUnavailable(true);
        setUnitId('');
        let breakdown: UnitOption | null = prefillUnit ?? null;
        if (!breakdown && p.unitId) {
          const { data: urow } = await supabase
            .from('units')
            .select(unitSelect)
            .eq('id', p.unitId)
            .maybeSingle();
          breakdown = urow ? (urow as UnitOption) : null;
        }
        setBreakdownUnit(breakdown);
        if (breakdown?.project_id) {
          void loadProjectPricing(breakdown.project_id);
        }
      }

      const amount = String(p.bookingAmount ?? '').trim();
      if (amount) setBookingAmount(amount);

      const mode = String(p.paymentMode ?? '').trim();
      if (mode && (PAYMENT_MODE_OPTIONS as readonly string[]).includes(mode)) {
        setPaymentMode(mode);
      }

      const ref = String(p.paymentReference ?? '').trim();
      if (ref) {
        const resolvedMode = mode || 'Cash';
        if (resolvedMode === 'UPI') setUpiUtr(ref);
        else if (resolvedMode === 'Cheque') setChequeNo(ref);
        else if (resolvedMode === 'NEFT/RTGS') setNeftRef(ref);
      }
    }

    setUnits(unitsList);
    setCustomers(customerList);
    setBookings(
      (bkData ?? []).map((row) => {
        const r = row as BookingListRow & { payment_detail?: unknown };
        const raw = r.co_buyers;
        const coParsed = Array.isArray(raw)
          ? (raw as unknown[]).filter(
            (x): x is CoBuyerStored =>
              !!x &&
              typeof x === 'object' &&
              typeof (x as CoBuyerStored).customer_id === 'string' &&
              typeof (x as CoBuyerStored).full_name === 'string'
          )
          : [];
        const payment_detail = parsePaymentDetailStored(r.payment_detail);
        return {
          ...r,
          co_buyers: coParsed.length ? coParsed : null,
          payment_detail
        };
      })
    );

    setLoading(false);
  }

  useEffect(() => {
    setPrefillMeta(null);
    setInquiryNegotiatedPrice(null);
    setPrefillCustomerMissing(false);
    setBreakdownUnit(null);
    setUnitFromInquiryUnavailable(false);
    setUnitId('');
    setCustomerId('');
    setCoBuyerSlots([]);
    setUpiUtr('');
    setChequeNo('');
    setNeftRef('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = units.find((x) => x.id === unitId);
    if (!u?.project_id) {
      setProjectParking(null);
      setProjectPricing(null);
      return;
    }
    void loadProjectPricing(u.project_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, units]);

  useEffect(() => {
    setCoBuyerSlots((prev) =>
      prev.map((s) =>
        s.customerId === customerId ? { ...s, customerId: '' } : s
      )
    );
  }, [customerId]);

  useEffect(() => {
    setUpiUtr('');
    setChequeNo('');
    setNeftRef('');
  }, [paymentMode]);

  useEffect(() => {
    const inquiryId = prefillMeta?.inquiryId;
    if (!inquiryId) {
      setInquiryNegotiatedPrice(null);
      setInquiryBookingBlockMessage(null);
      return;
    }
    if (
      prefillMeta.negotiatedPriceInr != null &&
      prefillMeta.negotiatedPriceInr > 0
    ) {
      setInquiryNegotiatedPrice(prefillMeta.negotiatedPriceInr);
    }
    let cancelled = false;
    void (async () => {
      const { data: inq } = await supabase
        .from('sales_inquiries')
        .select('funnel_stage, stage_data')
        .eq('id', inquiryId)
        .maybeSingle();
      if (cancelled) return;
      const { data: stageData } = await loadInquiryStageData(supabase, inquiryId);
      if (cancelled) return;
      setInquiryBookingBlockMessage(
        negotiationApprovalBlockMessage(stageData.negotiation, {
          funnelStage: String(inq?.funnel_stage ?? '')
        })
      );
      if (
        !(
          prefillMeta.negotiatedPriceInr != null &&
          prefillMeta.negotiatedPriceInr > 0
        )
      ) {
        setInquiryNegotiatedPrice(
          negotiatedPriceFromInquiryStage(
            stageData as Record<string, unknown>
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillMeta, supabase]);

  async function createBooking() {
    const selectedUnit = units.find((u) => u.id === unitId);
    if (!selectedUnit?.project_id || !unitId || !customerId) return;

    if (inquiryBookingBlockMessage) {
      pageError(inquiryBookingBlockMessage);
      return;
    }

    const coIdsOrdered = coBuyerSlots
      .map((s) => s.customerId)
      .filter((id): id is string => Boolean(id));
    const primaryCust = customers.find((c) => c.id === customerId);
    if (!primaryCust) {
      pageError('Choose a customer.');
      return;
    }
    if (!String(primaryCust.full_name ?? '').trim()) {
      pageError('Customer name is required.');
      return;
    }
    if (normalizePhoneDigits(primaryCust.phone).length !== 10) {
      pageError(
        'Customer phone number is required (10 digits). Update the customer record before booking.'
      );
      return;
    }
    const primaryPhone = normalizePhoneDigits(primaryCust.phone);
    const seenCoPhones = new Set<string>();
    for (const id of coIdsOrdered) {
      const co = customers.find((c) => c.id === id);
      if (!co) continue;
      const ph = normalizePhoneDigits(co.phone);
      if (ph && primaryPhone && ph === primaryPhone) {
        pageError('A co-buyer cannot share the primary customer phone number.');
        return;
      }
      if (ph) {
        if (seenCoPhones.has(ph)) {
          pageError('Co-buyers cannot share the same phone number.');
          return;
        }
        seenCoPhones.add(ph);
      }
    }

    if (
      paymentModeNeedsLoanBank(paymentMode) &&
      !String(loanBank || '').trim()
    ) {
      pageError('Select the loan or sanctioning bank.');
      return;
    }

    if (paymentMode === 'UPI' && !String(upiUtr || '').trim()) {
      pageError('Enter UPI UTR.');
      return;
    }
    if (paymentMode === 'Cheque' && !String(chequeNo || '').trim()) {
      pageError('Enter cheque number.');
      return;
    }
    if (paymentMode === 'NEFT/RTGS' && !String(neftRef || '').trim()) {
      pageError('Enter NEFT / RTGS reference.');
      return;
    }

    setCreating(true);
        setCreatedBookingId(null);
    try {
      const res = await fetch('/api/crm/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedUnit.project_id,
          unitId,
          customerId,
          salesInquiryId: prefillMeta?.inquiryId ?? null,
          coBuyerCustomerIds: coIdsOrdered,
          paymentMode,
          loanBank: paymentModeNeedsLoanBank(paymentMode) ? loanBank : null,
          paymentDetail: {
            utr: upiUtr.trim(),
            cheque_number: chequeNo.trim(),
            neft_ref: neftRef.trim()
          },
          bookingAmount: bookingAmount ? Number(bookingAmount) : null,
          tokenDate: prefillMeta?.tokenDate ?? null,
          saleTotalInr:
            paymentFinancialTotal?.financialTotalInr ??
            (catalogTotalInr > 0 ? catalogTotalInr : null),
          confirmImmediately: false
        })
      });
      const json = (await res.json()) as {
        bookingId?: string;
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Failed to create booking');
      const newId = json.bookingId ?? null;
      setCreatedBookingId(newId);
      if (json.redirectTo && newId) {
        router.push(json.redirectTo);
        return;
      }
      setUnitId('');
      setCustomerId('');
      setCoBuyerSlots([]);
      setUpiUtr('');
      setChequeNo('');
      setNeftRef('');
      setPrefillMeta(null);
      setBreakdownUnit(null);
      setUnitFromInquiryUnavailable(false);
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create booking');
    } finally {
      setCreating(false);
    }
  }

  async function submitNewCustomer() {
    const full_name = newCustomerDraft.full_name.trim();
    if (!full_name) {
      pageError('Customer name is required.');
      return;
    }
    const digits = normalizePhoneDigits(newCustomerDraft.phone);
    if (digits.length !== 10) {
      pageError('Enter a 10-digit phone number.');
      return;
    }
    setSavingCustomer(true);
        try {
      const { data, error: insErr } = await supabase
        .from('customers')
        .insert({
          full_name,
          phone: digits,
          email: newCustomerDraft.email.trim() || null
        })
        .select('id,full_name,phone,email')
        .single();
      if (insErr) throw insErr;
      const row = data as CustomerOption;
      setCustomers((cs) => [row, ...cs]);
      if (addCustomerCoSlotKey) {
        setCoBuyerSlots((prev) =>
          prev.map((s) =>
            s.key === addCustomerCoSlotKey ? { ...s, customerId: row.id } : s
          )
        );
      } else {
        setCustomerId(row.id);
      }
      setPrefillCustomerMissing(false);
      setAddCustomerOpen(false);
      setAddCustomerCoSlotKey(null);
      setNewCustomerDraft({ full_name: '', phone: '', email: '' });
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to create customer');
    } finally {
      setSavingCustomer(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const unitForCostPreview = useMemo((): UnitOption | null => {
    const fromPicker = unitId
      ? units.find((u) => u.id === unitId)
      : null;
    if (fromPicker) return fromPicker;
    if (
      prefillMeta &&
      breakdownUnit?.id === prefillMeta.unitId &&
      unitFromInquiryUnavailable
    ) {
      return breakdownUnit;
    }
    return null;
  }, [
    unitId,
    units,
    prefillMeta,
    breakdownUnit,
    unitFromInquiryUnavailable
  ]);

  const inquiryUnitMismatch = Boolean(
    prefillMeta &&
    unitForCostPreview &&
    unitForCostPreview.id !== prefillMeta.unitId &&
    !unitFromInquiryUnavailable
  );

  const inquiryCostBreakdown = useMemo(() => {
    if (!prefillMeta || !unitForCostPreview) return null;
    const mismatch =
      unitForCostPreview.id !== prefillMeta.unitId &&
      !unitFromInquiryUnavailable;
    const rate =
      !mismatch &&
        prefillMeta.parkingRateSnapshot != null &&
        prefillMeta.parkingRateSnapshot > 0
        ? prefillMeta.parkingRateSnapshot
        : 0;
    const projectSnap: {
      parking_slots: number | null;
      parking_rate: number | null;
    } = mismatch
        ? { parking_slots: null, parking_rate: null }
        : {
          parking_slots: prefillMeta.parkingSlotsAvailable,
          parking_rate: prefillMeta.parkingRateSnapshot
        };
    return computeBookingCostBreakdown(
      unitForCostPreview,
      mismatch ? 'No' : prefillMeta.parkingRequired,
      mismatch ? '1' : prefillMeta.parkingCount,
      rate,
      projectSnap,
      projectPricing ?? undefined
    );
  }, [prefillMeta, unitForCostPreview, unitFromInquiryUnavailable, projectPricing]);

  /** Inquiry overview rows plus GST/total so we do not need a second block in the unit card. */
  const inquiryPaymentOverviewRows = useMemo((): [string, string][] => {
    if (!inquiryCostBreakdown) return [];
    const u = unitForCostPreview;
    if (!u) return [...inquiryCostBreakdown.rows];
    if (projectPricing?.gst_registered) {
      return [...inquiryCostBreakdown.rows];
    }
    const dwellingInr = unitAgreementTotalInr(u);
    const gstInr = Math.round(dwellingInr * 0.05);
    const totalInr = dwellingInr + gstInr;
    const tail: [string, string][] =
      dwellingInr > 0
        ? [
          [
            'GST (5%)',
            `${formatInrCompactLacCr(gstInr)} (₹ ${gstInr.toLocaleString('en-IN')})`
          ],
          [
            'Total value (incl. GST)',
            `${formatInrCompactLacCr(totalInr)} (₹ ${totalInr.toLocaleString('en-IN')})`
          ]
        ]
        : [];
    return [...inquiryCostBreakdown.rows, ...tail];
  }, [inquiryCostBreakdown, unitForCostPreview, projectPricing]);

  /** Basic + GST (5%) breakdown for the unit being previewed (picker or inquiry snapshot). */
  const unitRateStructureRows = useMemo((): [string, string][] | null => {
    const u = unitForCostPreview;
    if (!u) return null;
    const billable = unitBillableAreaSqft(u);
    const legacyArea = Number(u.area) || 0;
    const rate = Number(u.rate) || 0;
    const dwellingInr = unitAgreementTotalInr(u);
    const gstInr = Math.round(dwellingInr * 0.05);
    const totalInr = dwellingInr + gstInr;
    const saleArea =
      billable > 0
        ? `${billable.toLocaleString('en-IN')} sq.ft billable`
        : legacyArea > 0
          ? `${legacyArea.toLocaleString('en-IN')} sq.ft`
          : '—';
    return [
      ['Floor', formatFloorLabel(u.floor, u.unit_type)],
      ['Configuration', u.unit_type?.trim() || '—'],
      ['Sale area', saleArea],
      [
        'Basic rate',
        rate > 0 ? `₹ ${rate.toLocaleString('en-IN')} / sq.ft` : '—'
      ],
      [
        'Dwelling agreement',
        dwellingInr > 0
          ? `${formatInrCompactLacCr(dwellingInr)} (₹ ${dwellingInr.toLocaleString('en-IN')})`
          : '—'
      ],
      [
        'GST (5%)',
        dwellingInr > 0
          ? `${formatInrCompactLacCr(gstInr)} (₹ ${gstInr.toLocaleString('en-IN')})`
          : '—'
      ],
      [
        'Total value (incl. GST)',
        totalInr > 0
          ? `${formatInrCompactLacCr(totalInr)} (₹ ${totalInr.toLocaleString('en-IN')})`
          : '—'
      ],
      [
        'Parking (project)',
        formatProjectParkingSummary(projectParking ?? null)
      ]
    ];
  }, [unitForCostPreview, projectParking]);

  /** Single Payment & cost overview panel for inquiry-prefill and normal booking. */
  const paymentCostOverviewMode = useMemo((): PaymentCostOverviewMode | null => {
    if (!unitForCostPreview) return null;
    if (prefillMeta && inquiryCostBreakdown) return 'inquiry';
    if (unitRateStructureRows && unitRateStructureRows.length > 0) {
      return 'standard';
    }
    return null;
  }, [
    unitForCostPreview,
    prefillMeta,
    inquiryCostBreakdown,
    unitRateStructureRows
  ]);

  const catalogTotalInr = useMemo(() => {
    if (inquiryCostBreakdown?.grandTotalInr && inquiryCostBreakdown.grandTotalInr > 0) {
      return inquiryCostBreakdown.grandTotalInr;
    }
    const u = unitForCostPreview;
    if (!u) return 0;
    const dwellingInr = unitAgreementTotalInr(u);
    if (dwellingInr <= 0) return 0;
    const gstInr = projectPricing?.gst_registered
      ? Math.round(
          (dwellingInr * (Number(projectPricing.gst_percent) || 0)) / 100
        )
      : Math.round(dwellingInr * 0.05);
    return dwellingInr + gstInr;
  }, [inquiryCostBreakdown, unitForCostPreview, projectPricing]);

  const paymentFinancialTotal = useMemo(() => {
    if (catalogTotalInr <= 0) return null;
    const negotiated =
      prefillMeta?.negotiatedPriceInr ?? inquiryNegotiatedPrice ?? null;
    const resolved = resolveBookingFinancialTotal(
      catalogTotalInr,
      negotiated
    );
    if (!resolved.negotiatedPriceInr) return null;
    return resolved;
  }, [
    catalogTotalInr,
    prefillMeta?.negotiatedPriceInr,
    inquiryNegotiatedPrice
  ]);

  const matchUnit = useCallback((u: UnitOption, q: string) => {
    const blob = [
      u.unit_code,
      u.wing_name,
      String(u.floor),
      u.unit_type ?? '',
      String(u.area ?? ''),
      String(u.rate ?? ''),
      u.status
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  }, []);

  const matchCustomer = useCallback((c: CustomerOption, q: string) => {
    const blob = [c.full_name, c.phone ?? '', c.email ?? '']
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  }, []);

  const customersForCoBuyerPicker = useCallback(
    (slotKey: string, selectedInSlot: string) => {
      if (!customerId) return [];
      const taken = new Set(
        coBuyerSlots
          .filter((s) => s.key !== slotKey && s.customerId)
          .map((s) => s.customerId)
      );
      return customers.filter(
        (c) =>
          c.id !== customerId &&
          (!taken.has(c.id) || c.id === selectedInSlot)
      );
    },
    [customers, coBuyerSlots, customerId]
  );

  const selectedCoBuyersResolved = useMemo(() => {
    return coBuyerSlots
      .map((s) => customers.find((c) => c.id === s.customerId))
      .filter((c): c is CustomerOption => !!c);
  }, [coBuyerSlots, customers]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Create booking
            </div>
            <div className="text-xs text-gray-500">
              Select an available unit, primary customer, and optional co-buyers.
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {prefillMeta ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200/90 bg-linear-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-emerald-100 px-4 py-3">
              <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                  <Sparkles className="size-5" aria-hidden />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    From inquiry
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-slate-600">
                    {prefillMeta.inquiryRef ? (
                      <span className="font-semibold text-emerald-900">
                        {prefillMeta.inquiryRef}
                      </span>
                    ) : (
                      <span>
                        Review booking details — customer and unit were prefilled
                        from your inquiry draft.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-slate-500 hover:text-slate-900"
                title="Dismiss banner"
                onClick={() => {
                  setPrefillMeta(null);
                  setPrefillCustomerMissing(false);
                  setInquiryBookingBlockMessage(null);
                  setBreakdownUnit(null);
                  setUnitFromInquiryUnavailable(false);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
            {unitFromInquiryUnavailable ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-950">
                {normalizeUnitStatusCode(breakdownUnit?.status) === 'TOKEN' ? (
                  <>
                    This unit is on token — pick it from the list below if it does
                    not appear selected. Token amount and payment details were
                    prefilled when available.
                  </>
                ) : (
                  <>
                    This inquiry&apos;s unit is not in the available list (it may be
                    booked). Pick another unit below. The cost overview still shows
                    the inquiry unit until you choose one.
                  </>
                )}
              </div>
            ) : null}
            {inquiryBookingBlockMessage ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-950">
                {inquiryBookingBlockMessage}
              </div>
            ) : null}
            {prefillCustomerMissing ? (
              <div className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  The linked customer record was not found. Search below and use{' '}
                  <span className="font-semibold">Add new customer</span> when no match
                  appears, or pick someone else from the list.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                  onClick={() => {
                    setNewCustomerDraft({ full_name: '', phone: '', email: '' });
                    setAddCustomerCoSlotKey(null);
                    setAddCustomerOpen(true);
                  }}
                >
                  Add customer now
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {createdBookingId ? (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Booking created: <strong>{createdBookingId}</strong>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SearchablePicker<UnitOption>
              label="Available units"
              itemCount={units.length}
              items={units}
              selectedId={unitId}
              onSelect={setUnitId}
              emptyMessage="No units match your search."
              searchPlaceholder="Search by code, wing, floor, type…"
              triggerPlaceholder="Choose an available unit…"
              matchItem={matchUnit}
              renderTriggerSummary={(u) => (
                <span className="block truncate">
                  <span className="font-medium text-foreground">
                    {u.unit_code}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {u.wing_name} · F{u.floor}
                    {u.unit_type ? ` · ${u.unit_type}` : ''}
                  </span>
                </span>
              )}
              renderRow={(u) => (
                <span className="block">
                  <span className="font-medium text-foreground">
                    {u.unit_code}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {u.wing_name} · Floor {u.floor}
                    {u.unit_type ? ` · ${u.unit_type}` : ''}
                    {u.area != null ? ` · ${u.area} sq.ft` : ''}
                    {u.rate != null
                      ? ` · ₹${formatInr(u.rate, { maximumFractionDigits: 0 })}/sq.ft`
                      : ''}
                  </span>
                </span>
              )}
            />
          </div>

          <div className="col-span-2">
            <SearchablePicker<CustomerOption>
              label="Customer *"
              itemCount={customers.length}
              items={customers}
              selectedId={customerId}
              onSelect={setCustomerId}
              emptyMessage="No customers match your search."
              emptyFooter={({ query, closePopover }) => (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mx-auto"
                  onClick={() => {
                    closePopover();
                    setNewCustomerDraft({
                      full_name: query.trim(),
                      phone: '',
                      email: ''
                    });
                    setAddCustomerCoSlotKey(null);
                    setAddCustomerOpen(true);
                  }}
                >
                  Add new customer…
                </Button>
              )}
              searchTrailing={({ query, closePopover }) => (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  title="Add new customer"
                  onClick={() => {
                    closePopover();
                    setNewCustomerDraft({
                      full_name: query.trim(),
                      phone: '',
                      email: ''
                    });
                    setAddCustomerCoSlotKey(null);
                    setAddCustomerOpen(true);
                  }}
                >
                  <UserPlus className="size-3.5" />
                  <span className="hidden sm:inline">Add</span>
                </Button>
              )}
              searchPlaceholder="Search by name, phone, email…"
              triggerPlaceholder="Choose a customer…"
              matchItem={matchCustomer}
              renderTriggerSummary={(c) => (
                <span className="block truncate">
                  <span className="font-medium text-foreground">
                    {c.full_name}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {c.phone ?? '—'}
                  </span>
                </span>
              )}
              renderRow={(c) => (
                <span className="block">
                  <span className="font-medium text-foreground">
                    {c.full_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              )}
            />
          </div>

          <div className="col-span-2 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">
                  Co-buyer(s) (optional)
                </div>
                <p className="max-w-xl text-xs text-muted-foreground">
                  Additional buyers on the same booking. Each row links a customer
                  record. The same phone number as the primary or another co-buyer
                  is not allowed.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCoBuyerSlots((s) => [...s, newCoBuyerSlot()])}
              >
                + Add co-buyer
              </Button>
            </div>
            {coBuyerSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No co-buyers added.</p>
            ) : (
              <div className="space-y-4">
                {coBuyerSlots.map((slot, idx) => {
                  const coItems = customersForCoBuyerPicker(
                    slot.key,
                    slot.customerId
                  );
                  return (
                    <div key={slot.key} className="space-y-2">
                      <SearchablePicker<CustomerOption>
                        label={`Co-buyer ${idx + 1}`}
                        itemCount={coItems.length}
                        items={coItems}
                        selectedId={slot.customerId}
                        onSelect={(id) =>
                          setCoBuyerSlots((prev) =>
                            prev.map((s) =>
                              s.key === slot.key ? { ...s, customerId: id } : s
                            )
                          )
                        }
                        emptyMessage={
                          !customerId
                            ? 'Choose a primary customer first.'
                            : 'No customers match your search.'
                        }
                        emptyFooter={
                          customerId
                            ? ({ query, closePopover }) => (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="mx-auto"
                                onClick={() => {
                                  closePopover();
                                  setNewCustomerDraft({
                                    full_name: query.trim(),
                                    phone: '',
                                    email: ''
                                  });
                                  setAddCustomerCoSlotKey(slot.key);
                                  setAddCustomerOpen(true);
                                }}
                              >
                                Add new customer…
                              </Button>
                            )
                            : undefined
                        }
                        searchTrailing={
                          customerId
                            ? ({ query, closePopover }) => (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 gap-1.5"
                                title="Add new customer"
                                onClick={() => {
                                  closePopover();
                                  setNewCustomerDraft({
                                    full_name: query.trim(),
                                    phone: '',
                                    email: ''
                                  });
                                  setAddCustomerCoSlotKey(slot.key);
                                  setAddCustomerOpen(true);
                                }}
                              >
                                <UserPlus className="size-3.5" />
                                <span className="hidden sm:inline">Add</span>
                              </Button>
                            )
                            : undefined
                        }
                        searchPlaceholder="Search by name, phone, email…"
                        triggerPlaceholder="Choose a co-buyer…"
                        matchItem={matchCustomer}
                        renderTriggerSummary={(c) => (
                          <span className="block truncate">
                            <span className="font-medium text-foreground">
                              {c.full_name}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {c.phone ?? '—'}
                            </span>
                          </span>
                        )}
                        renderRow={(c) => (
                          <span className="block">
                            <span className="font-medium text-foreground">
                              {c.full_name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {[c.phone, c.email].filter(Boolean).join(' · ') ||
                                '—'}
                            </span>
                          </span>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() =>
                            setCoBuyerSlots((prev) =>
                              prev.filter((s) => s.key !== slot.key)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>Payment mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Loan bank</Label>
            <Select
              value={loanBank === '' ? undefined : loanBank}
              onValueChange={setLoanBank}
              disabled={!paymentModeNeedsLoanBank(paymentMode)}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select bank…" />
              </SelectTrigger>
              <SelectContent>
                {LOAN_BANK_OPTIONS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {paymentMode === 'UPI' ? (
            <div className="col-span-2">
              <Label>UPI UTR</Label>
              <Input
                value={upiUtr}
                onChange={(e) => setUpiUtr(e.target.value)}
                placeholder="Bank reference / UTR"
                className="mt-1"
                autoComplete="off"
              />
            </div>
          ) : null}
          {paymentMode === 'Cheque' ? (
            <div className="col-span-2">
              <Label>Cheque number</Label>
              <Input
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                placeholder="Cheque no."
                className="mt-1"
                autoComplete="off"
              />
            </div>
          ) : null}
          {paymentMode === 'NEFT/RTGS' ? (
            <div className="col-span-2">
              <Label>NEFT / RTGS reference</Label>
              <Input
                value={neftRef}
                onChange={(e) => setNeftRef(e.target.value)}
                placeholder="Transaction reference"
                className="mt-1"
                autoComplete="off"
              />
            </div>
          ) : null}
          <div className="col-span-2">
            <Label>Booking amount (₹)</Label>
            <Input
              value={bookingAmount}
              onChange={(e) => setBookingAmount(e.target.value)}
              placeholder="500000"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs font-semibold text-gray-500">Unit</div>
            {unitForCostPreview ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold text-gray-900">
                  {unitForCostPreview.unit_code}
                </div>
                <div className="text-gray-600">
                  {unitForCostPreview.wing_name} ·{' '}
                  {formatFloorLabel(
                    unitForCostPreview.floor,
                    unitForCostPreview.unit_type
                  )}{' '}
                  · {unitForCostPreview.unit_type ?? '—'}
                </div>
                <div className="mt-1 text-gray-600">
                  Billable:{' '}
                  {unitBillableAreaSqft(unitForCostPreview) ||
                    unitForCostPreview.area ||
                    '—'}{' '}
                  sq.ft · List:{' '}
                  {formatInrCompactLacCr(
                    unitAgreementTotalInr(unitForCostPreview)
                  )}{' '}
                  · Rate:{' '}
                  {unitForCostPreview.rate != null
                    ? `₹ ${formatInr(unitForCostPreview.rate, { maximumFractionDigits: 0 })}/sq.ft`
                    : '—'}
                </div>
                {unitFromInquiryUnavailable ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                    {paymentCostOverviewMode != null
                      ? 'Inquiry unit — pick another unit above to book. Full cost breakdown is in Payment & cost overview above.'
                      : 'Inquiry unit — pick another unit above to book; select a unit to see pricing.'}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">No unit selected.</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-xs font-semibold text-gray-500">Customer</div>
            {selectedCustomer ? (
              <div className="mt-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Primary
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {selectedCustomer.full_name}
                </div>
                <div className="text-gray-600">
                  {selectedCustomer.phone ?? '—'} · {selectedCustomer.email ?? '—'}
                </div>
                {selectedCoBuyersResolved.length > 0 ? (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Co-buyer(s)
                    </div>
                    <ul className="mt-2 space-y-2">
                      {selectedCoBuyersResolved.map((c) => (
                        <li key={c.id}>
                          <div className="font-semibold text-gray-900">
                            {c.full_name}
                          </div>
                          <div className="text-gray-600">
                            {c.phone ?? '—'} · {c.email ?? '—'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">
                No customer selected.
              </div>
            )}
          </Card>
        </div>

        {paymentCostOverviewMode ? (
          <PaymentCostOverview
            mode={paymentCostOverviewMode}
            unitHeadline={
              paymentCostOverviewMode === 'inquiry' && inquiryCostBreakdown
                ? inquiryCostBreakdown.unitHeadline
                : unitForCostPreview
                  ? `${unitForCostPreview.unit_code} · ${unitForCostPreview.wing_name}`
                  : ''
            }
            rows={
              paymentCostOverviewMode === 'inquiry'
                ? inquiryPaymentOverviewRows
                : (unitRateStructureRows ?? [])
            }
            bookingAmount={Number(bookingAmount || 0)}
            financialTotal={paymentFinancialTotal}
            alert={
              paymentCostOverviewMode === 'inquiry' && inquiryUnitMismatch ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  You selected a different unit than the inquiry. Parking lines
                  below follow the new unit (no inquiry parking until you align with
                  sales).
                </div>
              ) : undefined
            }
          />
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button
            onClick={createBooking}
            disabled={
              creating ||
              !unitId ||
              !customerId ||
              Boolean(inquiryBookingBlockMessage)
            }
          >
            {creating ? 'Starting…' : 'Record token & continue'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Booking management
            </div>
            <div className="text-xs text-gray-500">
              Token → Application → Allotment → Confirmation ({bookings.length} total).
            </div>
          </div>
        </div>

        <BookingListTable
          rows={bookings as BookingListRow[]}
          projectNameById={projectNameById}
          loading={loading}
        />
      </Card>

      <Dialog
        open={addCustomerOpen}
        onOpenChange={(open) => {
          setAddCustomerOpen(open);
          if (!open) {
            setAddCustomerCoSlotKey(null);
            setNewCustomerDraft({ full_name: '', phone: '', email: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>
              Creates a new record and selects it for this booking.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-cust-name">Full name *</Label>
              <Input
                id="new-cust-name"
                value={newCustomerDraft.full_name}
                onChange={(e) =>
                  setNewCustomerDraft((d) => ({
                    ...d,
                    full_name: e.target.value
                  }))
                }
                placeholder="Name as on records"
                autoComplete="name"
              />
            </div>
            <PhoneInputField
              value={newCustomerDraft.phone}
              onChange={(v) =>
                setNewCustomerDraft((d) => ({ ...d, phone: v }))
              }
              label="Phone *"
              placeholder="Enter Phone number"
              id="new-cust-phone"
              mode="digits10"
            />

            <EmailInputField
              value={newCustomerDraft.email}
              onChange={(v) =>
                setNewCustomerDraft((d) => ({ ...d, email: v }))
              }
              label="Email (optional)"
              placeholder="email@example.com"
              id="new-cust-email"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddCustomerOpen(false)}
              disabled={savingCustomer}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitNewCustomer()}
              disabled={savingCustomer}
            >
              {savingCustomer ? 'Saving…' : 'Create & select'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

