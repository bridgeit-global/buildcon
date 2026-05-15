'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type ProjectParkingMeta,
  computeBookingCostBreakdown,
  formatProjectParkingSummary,
  parkingSlotsAskedFromCount
} from '../booking-cost-utils';
import { formatUnitAgreementValueCompact } from '../inr-format';
import { writeBookingPrefill } from '../booking-prefill-storage';
import {
  formatFloorLabel,
  isUnitSelectableForInquiry,
  statusLabelForUnit
} from '../inventory/inventory-utils';
import type { UnitRow } from './inquiry-types';

const LEAD_SOURCES = [
  'Direct',
  'Broker',
  'Referral',
  'Social Media',
  'Website',
  'Walk-in'
] as const;

function normalizePhone(p: string) {
  return String(p || '').replace(/\D/g, '');
}

const STEPS = [
  { id: 1, label: 'Customer' },
  { id: 2, label: 'Unit' },
  { id: 3, label: 'Review' }
] as const;
type StepId = (typeof STEPS)[number]['id'];

type NewInquiryWizardProps = {
  projectId: string;
  onInquirySaved?: () => void | Promise<void>;
  /** Called with the new inquiry id after successful save (skips form reset). */
  onCreated?: (inquiryId: string) => void;
  /** Notifies parent when the internal step changes (1 = Customer, 2 = Unit, 3 = Review). */
  onStepChange?: (step: number) => void;
  /** When true the internal 3-step stepper is hidden (parent supplies its own progress indicator). */
  hideStepper?: boolean;
};

export function NewInquiryWizard(props: NewInquiryWizardProps) {
  const { projectId, onInquirySaved, onCreated, onStepChange, hideStepper } =
    props;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLabel, setUserLabel] = useState<{ id: string; name: string }>({
    id: '',
    name: 'Logged-in user'
  });

  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>([]);
  const [projectParking, setProjectParking] =
    useState<ProjectParkingMeta | null>(null);

  const [sellerForm, setSellerForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    leadSource: 'Direct' as (typeof LEAD_SOURCES)[number],
    brokerId: '',
    interestedIn: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    notes: ''
  });

  const [step, setStep] = useState<StepId>(1);
  const [unitPickFilters, setUnitPickFilters] = useState({
    unitType: '',
    floor: '',
    structure: ''
  });

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const email = user?.email ?? '';
      const name =
        (user?.user_metadata?.full_name as string | undefined)?.trim() ||
        email ||
        'Logged-in user';
      setUserLabel({ id: user?.id ?? '', name });
    })();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('brokers')
        .select('id, full_name')
        .eq('status', 'Active')
        .order('full_name');
      if (!cancelled)
        setBrokers((data ?? []) as { id: string; full_name: string }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!projectId) {
      setProjectParking(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingUnits(true);
      const [unitsRes, projRes] = await Promise.all([
        supabase
          .from('units')
          .select(
            'id,unit_code,wing_name,floor,unit_no,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,status,project_id'
          )
          .eq('project_id', projectId)
          .order('wing_name', { ascending: true })
          .order('floor', { ascending: false })
          .order('unit_no', { ascending: true })
          .limit(500),
        supabase
          .from('projects')
          .select('parking_slots, parking_rate')
          .eq('id', projectId)
          .maybeSingle()
      ]);
      if (!cancelled && !unitsRes.error) {
        setUnits((unitsRes.data ?? []) as UnitRow[]);
      }
      if (!cancelled && projRes.data) {
        const row = projRes.data as {
          parking_slots: number | null;
          parking_rate: number | null;
        };
        setProjectParking({
          parking_slots: row.parking_slots ?? null,
          parking_rate: row.parking_rate ?? null
        });
      } else if (!cancelled) {
        setProjectParking(null);
      }
      if (!cancelled) setLoadingUnits(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const canSave = useMemo(() => {
    const brokerOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    return (
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      String(sellerForm.selectedUnitId || '').trim().length > 0 &&
      brokerOk
    );
  }, [sellerForm]);

  const selectableUnits = useMemo(
    () => (units || []).filter((u) => isUnitSelectableForInquiry(u.status)),
    [units]
  );

  const unitPickFilterOptions = useMemo(() => {
    const typeSet = new Set<string>();
    const floors = new Set<number>();
    const structures = new Set<string>();
    for (const u of selectableUnits) {
      const t = String(u.unit_type || '').trim();
      if (t) typeSet.add(t);
      if (Number.isFinite(u.floor)) floors.add(u.floor);
      const w = String(u.wing_name || '').trim();
      if (w) structures.add(w);
    }
    return {
      unitTypes: [...typeSet].sort((a, b) => a.localeCompare(b)),
      floors: [...floors].sort((a, b) => b - a),
      structures: [...structures].sort((a, b) => a.localeCompare(b))
    };
  }, [selectableUnits]);

  const filteredSelectableUnits = useMemo(() => {
    const wantType = String(unitPickFilters.unitType || '').trim();
    const wantFloor = String(unitPickFilters.floor || '').trim();
    const wantStructure = String(unitPickFilters.structure || '').trim();
    return selectableUnits.filter((u) => {
      if (wantType && String(u.unit_type || '').trim() !== wantType)
        return false;
      if (wantFloor && String(u.floor) !== wantFloor) return false;
      if (wantStructure && String(u.wing_name || '').trim() !== wantStructure)
        return false;
      return true;
    });
  }, [selectableUnits, unitPickFilters]);

  const selectedUnit = useMemo(() => {
    const id = String(sellerForm.selectedUnitId || '').trim();
    if (!id) return null;
    return units.find((u) => u.id === id) ?? null;
  }, [units, sellerForm.selectedUnitId]);

  const stepValid = useMemo(() => {
    const customerOk =
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      Boolean(userLabel.id);
    const leadOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    const unitOk = String(sellerForm.selectedUnitId || '').trim().length > 0;
    return {
      1: customerOk && leadOk,
      2: unitOk,
      3: true
    } as Record<StepId, boolean>;
  }, [sellerForm, userLabel.id]);

  const persistCustomerToDb = useCallback(async (): Promise<string | null> => {
    if (!userLabel.id) {
      setError('Sign in required to save customer details.');
      return null;
    }
    const digits = normalizePhone(sellerForm.phone);
    const fullName = String(sellerForm.customerName || '').trim();
    const email = String(sellerForm.email || '').trim() || null;

    try {
      const { data: existing, error: findErr } = await supabase
        .from('customers')
        .select('id')
        .eq('phone_normalized', digits)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;

      let customerId: string;
      if (existing?.id) {
        customerId = existing.id;
        const { error: upErr } = await supabase
          .from('customers')
          .update({ full_name: fullName, email, phone: digits })
          .eq('id', customerId);
        if (upErr) throw upErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('customers')
          .insert({ full_name: fullName, phone: digits, email })
          .select('id')
          .single();
        if (insErr) throw insErr;
        customerId = (inserted as { id: string }).id;
      }
      return customerId;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to save customer details'
      );
      return null;
    }
  }, [
    supabase,
    userLabel.id,
    sellerForm.customerName,
    sellerForm.phone,
    sellerForm.email
  ]);

  const continueToBookingFromReview = useCallback(async () => {
    if (!canSave || !projectId || !userLabel.id || !selectedUnit) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;
      writeBookingPrefill({
        projectId,
        inquiryId: null,
        inquiryRef: null,
        customerId,
        unitId: sellerForm.selectedUnitId,
        parkingRequired: sellerForm.parkingRequired,
        parkingCount: sellerForm.parkingCount,
        parkingSlotsAvailable: projectParking?.parking_slots ?? null,
        parkingRateSnapshot: projectParking?.parking_rate ?? null
      });
      router.push('/crm/bookings');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not continue to booking'
      );
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    projectId,
    userLabel.id,
    selectedUnit,
    persistCustomerToDb,
    sellerForm.selectedUnitId,
    sellerForm.parkingRequired,
    sellerForm.parkingCount,
    projectParking,
    router
  ]);

  async function goNext() {
    if (!stepValid[step] || saving) return;
    if (step === 1) {
      setSaving(true);
      setError('');
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        setStep(2);
        setSaveMsg('Customer saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
      return;
    }
    setStep((s) => Math.min(3, (s as number) + 1) as StepId);
  }

  function goBack() {
    setStep((s) => Math.max(1, (s as number) - 1) as StepId);
  }

  async function gotoStep(target: StepId) {
    if (target === step || saving) return;
    if (target < step) {
      setStep(target);
      return;
    }
    if (step === 1 && target > 1) {
      if (!stepValid[1]) {
        setStep(1);
        return;
      }
      setSaving(true);
      setError('');
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        setSaveMsg('Customer saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
    }
    for (let i = step; i < target; i++) {
      if (!stepValid[i as StepId]) {
        setStep(i as StepId);
        return;
      }
    }
    setStep(target);
  }

  function resetForm() {
    setSellerForm({
      customerName: '',
      phone: '',
      email: '',
      leadSource: 'Direct',
      brokerId: '',
      interestedIn: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      notes: ''
    });
    setStep(1);
    setUnitPickFilters({ unitType: '', floor: '', structure: '' });
  }

  async function saveInquiry() {
    if (!canSave || !projectId || !userLabel.id) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;

      const brokerId =
        sellerForm.leadSource === 'Broker' &&
          String(sellerForm.brokerId || '').trim()
          ? sellerForm.brokerId.trim()
          : null;

      const { data: inserted, error: inqErr } = await supabase
        .from('sales_inquiries')
        .insert({
          project_id: projectId,
          customer_id: customerId,
          unit_id: sellerForm.selectedUnitId,
          lead_source: sellerForm.leadSource,
          broker_id: brokerId,
          interested_in: sellerForm.interestedIn.trim() || null,
          parking_required: sellerForm.parkingRequired,
          parking_count: sellerForm.parkingCount,
          parking_slots_available: projectParking?.parking_slots ?? null,
          parking_rate_snapshot: projectParking?.parking_rate ?? null,
          notes: sellerForm.notes.trim() || null,
          created_by: userLabel.id
        })
        .select('id')
        .single();

      if (inqErr) throw inqErr;
      if (!inserted?.id) throw new Error('Inquiry insert returned no id');

      if (onCreated) {
        onCreated((inserted as { id: string }).id);
        await onInquirySaved?.();
      } else {
        await onInquirySaved?.();
        resetForm();
        setSaveMsg('Inquiry saved.');
        window.setTimeout(() => setSaveMsg(''), 1800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save inquiry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!hideStepper && (
        <Stepper
          current={step}
          onStepClick={gotoStep}
          valid={stepValid}
          disabled={saving}
        />
      )}

      {step === 1 ? (
        <StepCustomer
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          brokers={brokers}
          signedIn={Boolean(userLabel.id)}
        />
      ) : null}

      {step === 2 ? (
        <StepUnit
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          selectedUnit={selectedUnit}
          loadingUnits={loadingUnits}
          filteredUnits={filteredSelectableUnits}
          filterOptions={unitPickFilterOptions}
          filters={unitPickFilters}
          setFilters={setUnitPickFilters}
          projectParking={projectParking}
        />
      ) : null}

      {step === 3 ? (
        <StepReview
          sellerForm={sellerForm}
          selectedUnit={selectedUnit}
          brokers={brokers}
          projectParking={projectParking}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goBack}
            disabled={step === 1 || saving}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetForm}
            disabled={saving}
          >
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!userLabel.id ? (
            <span className="text-xs text-amber-700">Sign in required.</span>
          ) : null}
          {saveMsg ? (
            <span className="text-xs font-semibold text-green-700">
              {saveMsg}
            </span>
          ) : null}
          {step < 3 ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void goNext()}
              disabled={!stepValid[step] || saving}
            >
              {saving && step === 1
                ? 'Saving…'
                : step === 1
                  ? 'Save & next'
                  : 'Next'}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canSave || saving || !userLabel.id}
                onClick={() => void saveInquiry()}
              >
                {saving ? 'Saving…' : 'Save enquiry'}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSave || saving || !userLabel.id}
                onClick={() => void continueToBookingFromReview()}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                Confirm booking
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type SellerForm = {
  customerName: string;
  phone: string;
  email: string;
  leadSource: (typeof LEAD_SOURCES)[number];
  brokerId: string;
  interestedIn: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  selectedUnitId: string;
  notes: string;
};
type SetSellerForm = Dispatch<SetStateAction<SellerForm>>;

type UnitPickFilters = {
  unitType: string;
  floor: string;
  structure: string;
};

const UNIT_FILTER_ALL = '__unit_filter_all__';

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  current,
  onStepClick,
  valid,
  disabled
}: {
  current: StepId;
  onStepClick: (s: StepId) => void | Promise<void>;
  valid: Record<StepId, boolean>;
  disabled?: boolean;
}) {
  return (
    <ol className="mt-4 flex items-center">
      {STEPS.map((s, idx) => {
        const isDone = s.id < current && valid[s.id];
        const isActive = s.id === current;
        const isLast = idx === STEPS.length - 1;
        return (
          <li
            key={s.id}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <button
              type="button"
              onClick={() => void onStepClick(s.id)}
              disabled={disabled}
              className="group flex items-center gap-1.5 text-left disabled:pointer-events-none disabled:opacity-50"
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-colors',
                  isDone && 'border-green-500 bg-green-500 text-white',
                  isActive &&
                  'border-primary bg-primary text-primary-foreground shadow-sm',
                  !isDone &&
                  !isActive &&
                  'border-border bg-background text-muted-foreground group-hover:border-primary/40'
                )}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span
                className={cn(
                  'hidden text-[11px] font-semibold sm:inline',
                  isActive
                    ? 'text-foreground'
                    : isDone
                      ? 'text-green-700'
                      : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </button>
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mx-2 h-px flex-1 transition-colors',
                  s.id < current ? 'bg-green-400' : 'bg-border'
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Step 1: Customer ────────────────────────────────────────────────────────

function StepCustomer({
  sellerForm,
  setSellerForm,
  brokers,
  signedIn
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  brokers: { id: string; full_name: string }[];
  signedIn: boolean;
}) {
  return (
    <div className="mt-5 space-y-4">
      {!signedIn ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sign in to save and continue.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label className="text-xs">Customer name *</Label>
          <Input
            className="mt-1"
            value={sellerForm.customerName}
            onChange={(e) =>
              setSellerForm((s) => ({ ...s, customerName: e.target.value }))
            }
            placeholder="Full name"
          />
        </div>
        <PhoneInputField
          value={sellerForm.phone}
          onChange={(v) => setSellerForm((s) => ({ ...s, phone: v }))}
          label="Phone *"
          placeholder="10-digit mobile"
          mode="digits10"
        />
        <EmailInputField
          value={sellerForm.email}
          onChange={(v) => setSellerForm((s) => ({ ...s, email: v }))}
          placeholder="Email (optional)"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Lead source *</Label>
          <Select
            value={sellerForm.leadSource}
            onValueChange={(v) => {
              const nv = v as (typeof LEAD_SOURCES)[number];
              setSellerForm((s) => ({
                ...s,
                leadSource: nv,
                brokerId: nv === 'Broker' ? s.brokerId : ''
              }));
            }}
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((src) => (
                <SelectItem key={src} value={src}>
                  {src}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">
            Broker
            {sellerForm.leadSource === 'Broker' ? (
              <span className="ml-1 text-red-500">*</span>
            ) : null}
          </Label>
          <Select
            value={
              sellerForm.brokerId === '' ? undefined : sellerForm.brokerId
            }
            onValueChange={(v) =>
              setSellerForm((s) => ({ ...s, brokerId: v }))
            }
            disabled={sellerForm.leadSource !== 'Broker'}
          >
            <SelectTrigger
              className={cn(
                'mt-1 w-full',
                sellerForm.leadSource !== 'Broker' && 'opacity-50'
              )}
            >
              <SelectValue placeholder="Select broker…" />
            </SelectTrigger>
            <SelectContent>
              {brokers.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sellerForm.leadSource === 'Broker' && brokers.length === 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              No active brokers — add one under CRM → Brokers.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Parking toggle helpers ───────────────────────────────────────────────────

function ParkingYesNoToggle({
  value,
  onChange
}: {
  value: 'Yes' | 'No';
  onChange: (v: 'Yes' | 'No') => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {(['No', 'Yes'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 px-4 py-2 text-xs font-medium transition-colors',
            value === v
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          {v === 'No' ? 'No extra' : 'Yes, extra'}
        </button>
      ))}
    </div>
  );
}

function ParkingCountToggle({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-md border border-border',
        disabled && 'pointer-events-none opacity-40'
      )}
    >
      {(['1', '2', '3', '4+'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            value === v
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ─── Compact parking info bar ─────────────────────────────────────────────────

function ParkingInfoBar({
  projectParking,
  parkingRequired,
  parkingCount
}: {
  projectParking: ProjectParkingMeta | null;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
}) {
  const slots = projectParking?.parking_slots;
  const rate = projectParking?.parking_rate;
  const asked =
    parkingRequired === 'Yes' ? parkingSlotsAskedFromCount(parkingCount) : 0;
  const overAsk =
    parkingRequired === 'Yes' &&
    asked > 0 &&
    slots != null &&
    slots > 0 &&
    asked > slots;

  if (slots == null || slots <= 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Parking slot count not configured on this project.
      </p>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs',
        overAsk
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-blue-200 bg-blue-50/60 text-blue-900'
      )}
    >
      <span>
        <span className="font-semibold">{slots}</span> project slot
        {slots !== 1 ? 's' : ''}
        {rate != null && rate > 0 ? (
          <span className="ml-1 text-muted-foreground">
            · ₹{rate.toLocaleString('en-IN')}/slot
          </span>
        ) : null}
      </span>
      {overAsk ? (
        <span className="font-semibold text-amber-800">
          ⚠ Needs {asked} — exceeds {slots} recorded
        </span>
      ) : parkingRequired === 'Yes' ? (
        <span className="text-muted-foreground">
          Customer needs {asked} slot{asked !== 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  );
}

// ─── Step 2: Unit ─────────────────────────────────────────────────────────────

function StepUnit({
  sellerForm,
  setSellerForm,
  selectedUnit,
  loadingUnits,
  filteredUnits,
  filterOptions,
  filters,
  setFilters,
  projectParking
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  selectedUnit: UnitRow | null;
  loadingUnits: boolean;
  filteredUnits: UnitRow[];
  filterOptions: {
    unitTypes: string[];
    floors: number[];
    structures: string[];
  };
  filters: UnitPickFilters;
  setFilters: Dispatch<SetStateAction<UnitPickFilters>>;
  projectParking: ProjectParkingMeta | null;
}) {
  return (
    <div className="mt-5 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[120px] flex-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={filters.unitType === '' ? UNIT_FILTER_ALL : filters.unitType}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                unitType: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
          >
            <SelectTrigger className="mt-1 h-8 w-full text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNIT_FILTER_ALL}>All types</SelectItem>
              {filterOptions.unitTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[100px] flex-1">
          <Label className="text-xs">Floor</Label>
          <Select
            value={filters.floor === '' ? UNIT_FILTER_ALL : filters.floor}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                floor: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
          >
            <SelectTrigger className="mt-1 h-8 w-full text-xs">
              <SelectValue placeholder="All floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNIT_FILTER_ALL}>All floors</SelectItem>
              {filterOptions.floors.map((fl) => (
                <SelectItem key={fl} value={String(fl)}>
                  {formatFloorLabel(fl, null)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[120px] flex-1">
          <Label className="text-xs">Wing</Label>
          <Select
            value={
              filters.structure === '' ? UNIT_FILTER_ALL : filters.structure
            }
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                structure: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
          >
            <SelectTrigger className="mt-1 h-8 w-full text-xs">
              <SelectValue placeholder="All wings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNIT_FILTER_ALL}>All wings</SelectItem>
              {filterOptions.structures.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Unit grid */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            Available units
          </span>
          {loadingUnits ? (
            <span className="text-[11px] text-muted-foreground">
              Loading…
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {filteredUnits.length}
            </span>
          )}
        </div>
        <div className="max-h-[min(380px,50vh)] overflow-y-auto rounded-lg border border-border bg-muted/20 p-1.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {filteredUnits.length === 0 ? (
              <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No units match — clear a filter or check inventory status.
              </div>
            ) : (
              filteredUnits.map((u) => {
                const active = sellerForm.selectedUnitId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setSellerForm((s) => ({
                        ...s,
                        selectedUnitId: u.id,
                        interestedIn: s.interestedIn || u.unit_type || ''
                      }))
                    }
                    className={cn(
                      'min-h-[56px] rounded-md border p-2.5 text-left transition-colors',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:bg-muted/50'
                    )}
                  >
                    <div className="text-xs font-bold text-foreground">
                      {u.unit_code}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {u.unit_type ?? '—'} · {formatFloorLabel(u.floor, u.unit_type)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-foreground">
                      {formatUnitAgreementValueCompact(u)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Parking + notes (revealed after unit selection) */}
      {sellerForm.selectedUnitId ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">
              {selectedUnit?.unit_code ?? 'Selected unit'} — parking & notes
            </span>
          </div>

          <ParkingInfoBar
            projectParking={projectParking}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Extra parking?</Label>
              <div className="mt-1">
                <ParkingYesNoToggle
                  value={sellerForm.parkingRequired}
                  onChange={(v) =>
                    setSellerForm((s) => ({ ...s, parkingRequired: v }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">How many slots?</Label>
              <div className="mt-1">
                <ParkingCountToggle
                  value={sellerForm.parkingCount}
                  onChange={(v) =>
                    setSellerForm((s) => ({ ...s, parkingCount: v }))
                  }
                  disabled={sellerForm.parkingRequired !== 'Yes'}
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Requirements / notes</Label>
            <Textarea
              value={sellerForm.notes}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, notes: e.target.value }))
              }
              rows={2}
              placeholder="Higher floor, corner, sea view, budget, Vastu…"
              className="mt-1 min-h-[60px] resize-y text-xs"
            />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Select a unit above to set parking and requirements.
        </p>
      )}
    </div>
  );
}

// ─── Step 3: Review ──────────────────────────────────────────────────────────

function StepReview({
  sellerForm,
  selectedUnit,
  brokers,
  projectParking
}: {
  sellerForm: SellerForm;
  selectedUnit: UnitRow | null;
  brokers: { id: string; full_name: string }[];
  projectParking: ProjectParkingMeta | null;
}) {
  const brokerLabel =
    sellerForm.leadSource === 'Broker' && sellerForm.brokerId
      ? (brokers.find((b) => b.id === sellerForm.brokerId)?.full_name ?? '—')
      : null;

  if (!selectedUnit) {
    return (
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
        No unit selected. Go back to step 2 to pick a unit.
      </div>
    );
  }

  const u = selectedUnit;

  return (
    <div className="mt-5 space-y-4">
      {/* Summary grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Customer card */}
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Customer
          </p>
          <dl className="space-y-1">
            <SummaryRow label="Name" value={sellerForm.customerName.trim() || '—'} />
            <SummaryRow
              label="Phone"
              value={
                normalizePhone(sellerForm.phone).length === 10
                  ? sellerForm.phone
                  : '—'
              }
            />
            {sellerForm.email.trim() ? (
              <SummaryRow label="Email" value={sellerForm.email.trim()} />
            ) : null}
            <SummaryRow label="Source" value={sellerForm.leadSource} />
            {brokerLabel ? (
              <SummaryRow label="Broker" value={brokerLabel} />
            ) : null}
          </dl>
        </div>

        {/* Unit card */}
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Unit
          </p>
          <dl className="space-y-1">
            <SummaryRow label="Code" value={u.unit_code} />
            <SummaryRow label="Wing" value={u.wing_name || '—'} />
            <SummaryRow label="Floor" value={formatFloorLabel(u.floor, u.unit_type)} />
            <SummaryRow label="Type" value={u.unit_type?.trim() || '—'} />
            <SummaryRow label="Status" value={statusLabelForUnit(u.status)} />
            {u.carpet_area != null ? (
              <SummaryRow label="Carpet" value={`${u.carpet_area} sq.ft`} />
            ) : null}
          </dl>
        </div>
      </div>

      {/* Parking summary */}
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Parking
        </p>
        <div className="flex flex-wrap gap-4 text-xs">
          <span>
            Extra parking:{' '}
            <span className="font-semibold text-foreground">
              {sellerForm.parkingRequired === 'Yes'
                ? `Yes · ${sellerForm.parkingCount} slot${sellerForm.parkingCount === '1' ? '' : 's'}`
                : 'No'}
            </span>
          </span>
          <span className="text-muted-foreground">
            Project inventory: {formatProjectParkingSummary(projectParking)}
          </span>
        </div>
        {sellerForm.notes.trim() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Notes:</span>{' '}
            {sellerForm.notes.trim()}
          </p>
        ) : null}
      </div>

      {/* Cost sheet */}
      <CostSheet
        unit={selectedUnit}
        parkingRequired={sellerForm.parkingRequired}
        parkingCount={sellerForm.parkingCount}
        projectParking={projectParking}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

// ─── Cost sheet ───────────────────────────────────────────────────────────────

function CostSheet({
  unit,
  parkingRequired,
  parkingCount,
  projectParking
}: {
  unit: UnitRow;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  projectParking: ProjectParkingMeta | null;
}) {
  const slotRate =
    projectParking?.parking_rate != null && projectParking.parking_rate > 0
      ? projectParking.parking_rate
      : 0;
  const { rows } = computeBookingCostBreakdown(
    unit,
    parkingRequired,
    parkingCount,
    slotRate,
    projectParking
  );
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Cost estimate
        </span>
        <span className="text-xs font-semibold text-foreground">
          {unit.unit_code}
        </span>
        <span className="text-[11px] text-muted-foreground">
          · {unit.wing_name}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 rounded border border-border/70 bg-background px-2.5 py-1.5"
          >
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-right text-xs font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Estimate only. Excludes stamp duty, GST, registration, and other
        project-specific charges.
      </p>
    </div>
  );
}
