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

const INTEREST_TYPES = [
  '1RK',
  '1BHK',
  '1.5BHK',
  '2BHK',
  '2.5BHK',
  '3BHK',
  '3.5BHK',
  '4BHK',
  '5BHK',
  'Studio',
  'Duplex',
  'Penthouse',
  'Shop',
  'Office'
] as const;

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

const INQUIRY_INTEREST_ALL = '__inquiry_interest_all__';

const STEPS = [
  { id: 1, label: 'Customer' },
  { id: 2, label: 'Select unit' },
  { id: 3, label: 'Unit details' },
  { id: 4, label: 'Confirm' }
] as const;
type StepId = (typeof STEPS)[number]['id'];

export type NewInquiryWizardProps = {
  projectId: string;
  /** e.g. refetch list after “save enquiry only” */
  onInquirySaved?: () => void | Promise<void>;
};

export function NewInquiryWizard(props: NewInquiryWizardProps) {
  const { projectId, onInquirySaved } = props;
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

  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>(
    []
  );
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
      3: unitOk,
      4: true
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
          .update({
            full_name: fullName,
            email,
            phone: digits
          })
          .eq('id', customerId);
        if (upErr) throw upErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('customers')
          .insert({
            full_name: fullName,
            phone: digits,
            email
          })
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
        setSaveMsg('Customer details saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
      return;
    }
    setStep((s) => Math.min(4, (s as number) + 1) as StepId);
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
        setSaveMsg('Customer details saved.');
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

      await onInquirySaved?.();
      resetForm();
      setSaveMsg('Inquiry saved.');
      window.setTimeout(() => setSaveMsg(''), 1800);
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

      <Stepper
        current={step}
        onStepClick={gotoStep}
        valid={stepValid}
        disabled={saving}
      />

      {step === 1 ? (
        <StepCustomerAndLead
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          brokers={brokers}
          signedIn={Boolean(userLabel.id)}
        />
      ) : null}

      {step === 2 ? (
        <StepSelectUnit
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
        <StepUnitDetails
          sellerForm={sellerForm}
          selectedUnit={selectedUnit}
          projectParking={projectParking}
        />
      ) : null}

      {step === 4 ? (
        <StepConfirm
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
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
            onClick={goBack}
            disabled={step === 1 || saving}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetForm}
            disabled={saving}
          >
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!userLabel.id ? (
            <span className="text-xs text-amber-700">
              Sign in required to save.
            </span>
          ) : null}
          {saveMsg ? (
            <span className="text-xs font-semibold text-green-700">
              {saveMsg}
            </span>
          ) : null}
          {step < 4 ? (
            <Button
              type="button"
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
                disabled={!canSave || saving || !userLabel.id}
                onClick={() => void saveInquiry()}
              >
                {saving ? 'Saving…' : 'Save enquiry only'}
              </Button>
              <Button
                type="button"
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
              className="group flex items-center gap-2 text-left disabled:pointer-events-none disabled:opacity-50"
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                  isDone && 'border-green-500 bg-green-500 text-white',
                  isActive &&
                    'border-blue-500 bg-blue-500 text-white shadow-sm',
                  !isDone &&
                    !isActive &&
                    'border-border bg-background text-muted-foreground group-hover:border-blue-300'
                )}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
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
                  'mx-3 h-px flex-1 transition-colors',
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

type UnitPickFilters = {
  unitType: string;
  floor: string;
  structure: string;
};

const UNIT_FILTER_ALL = '__unit_filter_all__';

function StepCustomerAndLead({
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
    <div className="mt-6 space-y-4">
      {!signedIn ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sign in to save customer details to the database and continue to the
          next step.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Customer is saved when you continue (by phone number — existing
          customers are updated).
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <Label>Customer name *</Label>
          <Input
            className="mt-1"
            value={sellerForm.customerName}
            onChange={(e) =>
              setSellerForm((s) => ({ ...s, customerName: e.target.value }))
            }
            placeholder="Customer name"
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
          placeholder="Email"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Lead source *</Label>
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
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Broker</Label>
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
                sellerForm.leadSource !== 'Broker' && 'opacity-60'
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
              No active brokers. Add one under CRM → Brokers.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProjectParkingHighlight({
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

  if (slots == null || slots <= 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-950">
        <div className="text-xs font-bold uppercase tracking-wide text-amber-900/90">
          Project parking
        </div>
        <p className="mt-2 text-xs leading-relaxed">
          No parking slot count is configured on this project. Extra parking
          pricing may need to be confirmed manually.
        </p>
      </div>
    );
  }

  const overAsk =
    parkingRequired === 'Yes' && asked > 0 && asked > slots;

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        overAsk
          ? 'border-amber-300 bg-amber-50/95'
          : 'border-blue-200 bg-linear-to-br from-blue-50/90 to-background'
      )}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Available parking (this project)
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {slots}
          </div>
          <div className="text-[11px] text-muted-foreground">
            slot{slots !== 1 ? 's' : ''} on the project
          </div>
        </div>
        {rate != null && rate > 0 ? (
          <div className="text-sm">
            <span className="font-semibold text-foreground">
              ₹{rate.toLocaleString('en-IN')}
            </span>
            <span className="text-muted-foreground"> / extra slot (estimate)</span>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            Extra-slot rate not set on project
          </div>
        )}
      </div>
      {parkingRequired === 'Yes' ? (
        <p
          className={cn(
            'mt-3 text-xs leading-relaxed',
            overAsk ? 'font-semibold text-amber-950' : 'text-muted-foreground'
          )}
        >
          Customer needs{' '}
          <span className="font-semibold text-foreground">{asked}</span> extra
          slot{asked !== 1 ? 's' : ''} (from count below).
          {overAsk
            ? ` That exceeds the ${slots} slot(s) recorded on the project — align with inventory before committing.`
            : null}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          If the customer wants more parking than the unit includes, set
          “Parking required” below and pick how many slots they are aiming for.
        </p>
      )}
    </div>
  );
}

function CustomerLookingForField({
  sellerForm,
  setSellerForm
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
}) {
  return (
    <div>
      <Label>Looking for (layout / configuration)</Label>
      <Select
        value={
          sellerForm.interestedIn === ''
            ? INQUIRY_INTEREST_ALL
            : sellerForm.interestedIn
        }
        onValueChange={(v) =>
          setSellerForm((s) => ({
            ...s,
            interestedIn: v === INQUIRY_INTEREST_ALL ? '' : v
          }))
        }
      >
        <SelectTrigger className="mt-1 w-full">
          <SelectValue placeholder="What are they shopping for?" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INQUIRY_INTEREST_ALL}>
            Not sure / open to options
          </SelectItem>
          {INTEREST_TYPES.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[10px] text-muted-foreground">
        When this matches an inventory label, the unit-type filter below updates
        to match.
      </p>
    </div>
  );
}

function CustomerUnitNeedsGrid({
  sellerForm,
  setSellerForm,
  notesPlaceholder
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  notesPlaceholder: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <Label>Extra parking needed?</Label>
        <Select
          value={sellerForm.parkingRequired}
          onValueChange={(v) =>
            setSellerForm((s) => ({
              ...s,
              parkingRequired: v as 'Yes' | 'No'
            }))
          }
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="No">No extra parking</SelectItem>
            <SelectItem value="Yes">Yes, extra parking</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>How many extra slots?</Label>
        <Select
          value={sellerForm.parkingCount}
          onValueChange={(v) =>
            setSellerForm((s) => ({ ...s, parkingCount: v }))
          }
          disabled={sellerForm.parkingRequired !== 'Yes'}
        >
          <SelectTrigger
            className={cn(
              'mt-1 w-full',
              sellerForm.parkingRequired !== 'Yes' && 'opacity-60'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['1', '2', '3', '4+'] as const).map((x) => (
              <SelectItem key={x} value={x}>
                {x} slot{x === '1' ? '' : 's'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label>Other requirements</Label>
        <Textarea
          value={sellerForm.notes}
          onChange={(e) =>
            setSellerForm((s) => ({ ...s, notes: e.target.value }))
          }
          rows={3}
          placeholder={notesPlaceholder}
          className="mt-1 min-h-[72px] resize-y"
        />
      </div>
    </div>
  );
}

function StepSelectUnit({
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
  useEffect(() => {
    const raw = sellerForm.interestedIn.trim();
    if (!raw) return;
    const norm = raw.replace(/\s+/g, '').toLowerCase();
    const hit = filterOptions.unitTypes.find((t) => {
      const tn = String(t).replace(/\s+/g, '').toLowerCase();
      return tn === norm || tn.includes(norm) || norm.includes(tn);
    });
    if (hit) {
      setFilters((f) => (f.unitType === hit ? f : { ...f, unitType: hit }));
    }
  }, [sellerForm.interestedIn, filterOptions.unitTypes, setFilters]);

  return (
    <div className="mt-6 space-y-8">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-foreground">Shortlist a unit</h2>
          <p className="text-[11px] text-muted-foreground">
            Narrow by inventory labels, floor, and wing, then tap a unit. After
            you pick one, parking and other requirements appear below. Cards only
            show statuses you can attach to an enquiry.
          </p>
        </div>
        <div className="max-w-md">
          <CustomerLookingForField
            sellerForm={sellerForm}
            setSellerForm={setSellerForm}
          />
        </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <Label>Unit type</Label>
          <Select
            value={filters.unitType === '' ? UNIT_FILTER_ALL : filters.unitType}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                unitType: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
          >
            <SelectTrigger className="mt-1 w-full">
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
        <div className="min-w-[140px] flex-1">
          <Label>Floor</Label>
          <Select
            value={filters.floor === '' ? UNIT_FILTER_ALL : filters.floor}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                floor: v === UNIT_FILTER_ALL ? '' : v
              }))
            }
          >
            <SelectTrigger className="mt-1 w-full">
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
        <div className="min-w-[160px] flex-1">
          <Label>Structure (wing)</Label>
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
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="All structures" />
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

      <div className="text-xs font-semibold text-foreground">
        Available units
        {loadingUnits ? (
          <span className="ml-2 font-normal text-muted-foreground">
            Loading inventory…
          </span>
        ) : (
          <span className="ml-2 font-normal text-muted-foreground">
            ({filteredUnits.length} shown)
          </span>
        )}
      </div>
      <div className="max-h-[min(420px,55vh)] overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUnits.length === 0 ? (
            <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              No units match these filters. Clear a filter or check inventory
              status.
            </div>
          ) : (
            filteredUnits.map((u) => {
              const active = sellerForm.selectedUnitId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setSellerForm((s) => ({ ...s, selectedUnitId: u.id }))
                  }
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    active
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-border bg-background hover:bg-muted/50'
                  )}
                >
                  <div className="text-xs font-bold text-foreground">
                    {u.unit_code}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {u.unit_type ?? '—'} · {u.wing_name} ·{' '}
                    {formatFloorLabel(u.floor, u.unit_type)}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-foreground">
                    {formatUnitAgreementValueCompact(u)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      {!sellerForm.selectedUnitId ? (
        <p className="text-[11px] text-muted-foreground">
          Select a unit above, then answer parking and other requirements below
          before continuing.
        </p>
      ) : null}
      </section>

      {sellerForm.selectedUnitId ? (
        <section className="rounded-xl border border-blue-200/80 bg-card p-4 shadow-sm sm:p-5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-foreground">
              Parking and requirements
            </h2>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              For{' '}
              <span className="font-semibold text-foreground">
                {selectedUnit?.unit_code ?? 'this unit'}
              </span>
              . This is saved with the enquiry and drives the cost estimate on the
              next steps.
            </p>
          </div>
          <div className="mt-4 space-y-4">
            <ProjectParkingHighlight
              projectParking={projectParking}
              parkingRequired={sellerForm.parkingRequired}
              parkingCount={sellerForm.parkingCount}
            />
            <CustomerUnitNeedsGrid
              sellerForm={sellerForm}
              setSellerForm={setSellerForm}
              notesPlaceholder="e.g. higher floor, corner, sea view, budget band, timeline, Vastu, family size…"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepUnitDetails({
  sellerForm,
  selectedUnit,
  projectParking
}: {
  sellerForm: SellerForm;
  selectedUnit: UnitRow | null;
  projectParking: ProjectParkingMeta | null;
}) {
  if (!selectedUnit) {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
        {sellerForm.selectedUnitId
          ? 'Selected unit is no longer in the loaded list. Go back and pick another unit.'
          : 'Choose a unit in the previous step to see its details here.'}
      </div>
    );
  }

  const u = selectedUnit;
  const specRows: [string, string][] = [
    ['Unit code', u.unit_code],
    ['Structure (wing)', u.wing_name || '—'],
    ['Floor', formatFloorLabel(u.floor, u.unit_type)],
    ['Unit no.', String(u.unit_no)],
    ['Unit type', u.unit_type?.trim() || '—'],
    ['Status', statusLabelForUnit(u.status)],
    ['Carpet area', u.carpet_area != null ? `${u.carpet_area} sq.ft` : '—'],
    ['BUA', u.bua_area != null ? `${u.bua_area} sq.ft` : '—'],
    ['Saleable area', u.area != null ? `${u.area} sq.ft` : '—'],
    [
      'Base rate',
      u.rate != null ? `₹${u.rate.toLocaleString('en-IN')}/sq.ft` : '—'
    ],
    [
      'Floor rise',
      u.floor_rise_charge != null
        ? `₹${u.floor_rise_charge.toLocaleString('en-IN')}`
        : '—'
    ],
    [
      'PLC',
      u.plc_charge != null
        ? `₹${u.plc_charge.toLocaleString('en-IN')}`
        : '—'
    ]
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Unit specification
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {specRows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-3 rounded-md border border-border/80 px-3 py-2"
            >
              <dt className="text-[11px] font-semibold text-muted-foreground">
                {label}
              </dt>
              <dd className="text-right text-xs font-semibold text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <CostSheet
        unit={selectedUnit}
        parkingRequired={sellerForm.parkingRequired}
        parkingCount={sellerForm.parkingCount}
        projectParking={projectParking}
      />
      <p className="text-[11px] text-muted-foreground">
        Parking and notes were captured after you chose the unit. The cost sheet
        uses that parking choice; you can fine-tune parking on the final confirm
        step before saving.
      </p>
    </div>
  );
}

function StepConfirm({
  sellerForm,
  setSellerForm,
  selectedUnit,
  brokers,
  projectParking
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  selectedUnit: UnitRow | null;
  brokers: { id: string; full_name: string }[];
  projectParking: ProjectParkingMeta | null;
}) {
  const brokerLabel =
    sellerForm.leadSource === 'Broker' && sellerForm.brokerId
      ? (brokers.find((b) => b.id === sellerForm.brokerId)?.full_name ?? '—')
      : '—';

  const customer: [string, string][] = [
    ['Name', sellerForm.customerName.trim() || '—'],
    [
      'Phone',
      normalizePhone(sellerForm.phone).length === 10
        ? sellerForm.phone
        : '—'
    ],
    ['Email', sellerForm.email.trim() || '—']
  ];
  const leadRows: [string, string][] = [
    ['Lead source', sellerForm.leadSource],
    ...(sellerForm.leadSource === 'Broker'
      ? ([['Broker', brokerLabel]] as [string, string][])
      : [])
  ];
  const unitSummaryRows: [string, string][] = [
    [
      'Looking for',
      sellerForm.interestedIn.trim() || 'Open to options'
    ],
    [
      'Extra parking',
      sellerForm.parkingRequired === 'Yes'
        ? `Yes · ${sellerForm.parkingCount} slot${
            sellerForm.parkingCount === '1' ? '' : 's'
          }`
        : 'No'
    ],
    [
      'Project parking (inventory)',
      formatProjectParkingSummary(projectParking)
    ]
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Confirm & save
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Double-check parking against project availability — it flows into the
          enquiry and the quote below. Use the stepper to go back and change
          customer, lead, unit, or written requirements.
        </p>
        <div className="mt-4 space-y-4">
          <ProjectParkingHighlight
            projectParking={projectParking}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Extra parking needed?</Label>
              <Select
                value={sellerForm.parkingRequired}
                onValueChange={(v) =>
                  setSellerForm((s) => ({
                    ...s,
                    parkingRequired: v as 'Yes' | 'No'
                  }))
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No extra parking</SelectItem>
                  <SelectItem value="Yes">Yes, extra parking</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>How many extra slots?</Label>
              <Select
                value={sellerForm.parkingCount}
                onValueChange={(v) =>
                  setSellerForm((s) => ({ ...s, parkingCount: v }))
                }
                disabled={sellerForm.parkingRequired !== 'Yes'}
              >
                <SelectTrigger
                  className={cn(
                    'mt-1 w-full',
                    sellerForm.parkingRequired !== 'Yes' && 'opacity-60'
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['1', '2', '3', '4+'] as const).map((x) => (
                    <SelectItem key={x} value={x}>
                      {x} slot{x === '1' ? '' : 's'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReviewBlock title="Customer" rows={customer} />
        <ReviewBlock title="Lead" rows={leadRows} />
      </div>
      <ReviewBlock title="Unit requirements (from step 2)" rows={unitSummaryRows} />
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Other requirements
        </div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {sellerForm.notes.trim() || '—'}
        </p>
      </div>
      <div>
        {selectedUnit ? (
          <CostSheet
            unit={selectedUnit}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
            projectParking={projectParking}
          />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No unit selected. Go back to step 2 to pick a unit.
          </div>
        )}
      </div>
    </div>
  );
}

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
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Cost sheet
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
        {unit.unit_code}{' '}
        <span className="font-normal text-muted-foreground">
          · {unit.wing_name}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 rounded-md border border-border/80 bg-background px-3 py-2"
          >
            <dt className="text-[11px] font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className="text-right text-xs font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Dwelling line uses billable carpet/BUA when set, plus floor-rise and PLC
        lump sums. Extra parking beyond what is bundled with the unit is
        estimated from the project rate. Stamp duty, registration, GST, and
        other charges depend on project terms and local law.
      </p>
    </div>
  );
}

function ReviewBlock({
  title,
  rows
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0 last:pb-0"
          >
            <dt className="text-[11px] font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className="text-right text-xs font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
