'use client';

import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
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
  type ProjectPricingMeta,
  parkingSlotsAskedFromCount
} from '../booking-cost-utils';
import { UnitCostSheet } from '../_components/unit-cost-sheet';
import { writeBookingPrefill } from '../booking-prefill-storage';
import {
  formatFloorLabel,
  isUnitAvailableForBooking,
  statusLabelForUnit
} from '../inventory/inventory-utils';
import { unitStatusInquiryStageHint } from './inquiry-stage-unit-map';
import { qualifyInquiryWithUnit } from './inquiry-stage-transitions';
import type { UnitRow } from './inquiry-types';
import {
  DEFAULT_UNIT_PICK_FILTERS,
  InquiryUnitPicker,
  type UnitPickFilters
} from './inquiry-unit-picker';

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
  { id: 3, label: 'Details' }
] as const;
type StepId = (typeof STEPS)[number]['id'];

type NewInquiryWizardProps = {
  onInquirySaved?: () => void | Promise<void>;
  /** Called with the new inquiry id after successful save (skips form reset). */
  onCreated?: (inquiryId: string) => void;
  /** Notifies parent when the internal step changes (1 = Customer, 2 = Unit, 3 = Review). */
  onStepChange?: (step: number) => void;
  /** When true the internal 3-step stepper is hidden (parent supplies its own progress indicator). */
  hideStepper?: boolean;
};

function mapUnitRowFromDb(row: Record<string, unknown>): UnitRow {
  const pr = row.projects as { name?: unknown } | null | undefined;
  const project_name =
    pr && typeof pr === 'object' && pr !== null && 'name' in pr
      ? String((pr as { name: unknown }).name ?? '').trim() || null
      : null;
  const { projects: _drop, ...rest } = row;
  return { ...(rest as Omit<UnitRow, 'project_name'>), project_name };
}

export function NewInquiryWizard(props: NewInquiryWizardProps) {
  const { onInquirySaved, onCreated, onStepChange, hideStepper } = props;
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
  const [projectPricing, setProjectPricing] =
    useState<ProjectPricingMeta | null>(null);

  const [sellerForm, setSellerForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    leadSource: 'Direct' as (typeof LEAD_SOURCES)[number],
    brokerId: '',
    interestedIn: '',
    budgetMin: '',
    budgetMax: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    notes: ''
  });

  const [step, setStep] = useState<StepId>(1);
  const [unitPickFilters, setUnitPickFilters] =
    useState<UnitPickFilters>(DEFAULT_UNIT_PICK_FILTERS);

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
    let cancelled = false;
    void (async () => {
      setLoadingUnits(true);
      const unitsRes = await supabase
        .from('units')
        .select(
          'id,unit_code,wing_name,floor,unit_no,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,parking_slots_included,status,project_id,projects(name)'
        )
        .order('project_id', { ascending: true })
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(2000);
      if (!cancelled && !unitsRes.error) {
        const raw = (unitsRes.data ?? []) as Record<string, unknown>[];
        setUnits(raw.map(mapUnitRowFromDb));
      } else if (!cancelled && unitsRes.error) {
        setUnits([]);
      }
      if (!cancelled) setLoadingUnits(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

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
    () => (units || []).filter((u) => isUnitAvailableForBooking(u.status)),
    [units]
  );

  const selectedUnit = useMemo(() => {
    const id = String(sellerForm.selectedUnitId || '').trim();
    if (!id) return null;
    return units.find((u) => u.id === id) ?? null;
  }, [units, sellerForm.selectedUnitId]);

  useEffect(() => {
    const pid = String(selectedUnit?.project_id || '').trim();
    if (!pid) {
      setProjectParking(null);
      setProjectPricing(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const projRes = await supabase
        .from('projects')
        .select(
          'parking_slots,parking_rate,pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
        )
        .eq('id', pid)
        .maybeSingle();
      if (cancelled) return;
      if (projRes.data) {
        const row = projRes.data as {
          parking_slots: number | null;
          parking_rate: number | null;
          pricing_gst_registered: boolean | null;
          pricing_gst_percent: number | null;
          pricing_stamp_duty_percent: number | null;
          pricing_registration_fee: number | null;
        };
        setProjectParking({
          parking_slots: row.parking_slots ?? null,
          parking_rate: row.parking_rate ?? null
        });
        setProjectPricing({
          gst_registered: Boolean(row.pricing_gst_registered),
          gst_percent: Number(row.pricing_gst_percent) || 0,
          stamp_duty_percent: Number(row.pricing_stamp_duty_percent) || 0,
          registration_fee: Number(row.pricing_registration_fee) || 0
        });
      } else {
        setProjectParking(null);
        setProjectPricing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUnit?.project_id, supabase]);

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
    const inquiryProjectId = String(selectedUnit?.project_id || '').trim();
    if (!canSave || !inquiryProjectId || !userLabel.id || !selectedUnit) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;
      writeBookingPrefill({
        projectId: inquiryProjectId,
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
      budgetMin: '',
      budgetMax: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      notes: ''
    });
    setStep(1);
    setUnitPickFilters(DEFAULT_UNIT_PICK_FILTERS);
  }

  async function saveInquiry() {
    const inquiryProjectId = String(selectedUnit?.project_id || '').trim();
    if (!canSave || !inquiryProjectId || !userLabel.id) return;
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
          project_id: inquiryProjectId,
          customer_id: customerId,
          unit_id: sellerForm.selectedUnitId,
          lead_source: sellerForm.leadSource,
          broker_id: brokerId,
          interested_in: sellerForm.interestedIn.trim() || null,
          notes: sellerForm.notes.trim() || null,
          created_by: userLabel.id
        })
        .select('id')
        .single();

      if (inqErr) throw inqErr;
      if (!inserted?.id) throw new Error('Inquiry insert returned no id');

      const inquiryId = (inserted as { id: string }).id;

      const qualifiedNotes = [
        sellerForm.interestedIn.trim()
          ? `Interested in: ${sellerForm.interestedIn.trim()}`
          : '',
        sellerForm.notes.trim()
      ]
        .filter(Boolean)
        .join('\n');

      const enquiryPayload = {
        cost_sheet_notes: sellerForm.notes.trim() || undefined,
        notes: sellerForm.interestedIn.trim() || undefined
      };

      const qualResult = await qualifyInquiryWithUnit(supabase, {
        inquiryId,
        unitId: sellerForm.selectedUnitId,
        qualifiedPayload: {
          budget_min: sellerForm.budgetMin.trim() || undefined,
          budget_max: sellerForm.budgetMax.trim() || undefined,
          notes: qualifiedNotes || undefined
        },
        enquiryPayload: Object.values(enquiryPayload).some(Boolean)
          ? enquiryPayload
          : undefined
      });
      if (!qualResult.ok) {
        throw new Error(qualResult.error ?? 'Failed to qualify enquiry');
      }

      if (onCreated) {
        onCreated(inquiryId);
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
        <div className="space-y-4">
          <InquiryUnitPicker
            selectableUnits={selectableUnits}
            loadingUnits={loadingUnits}
            selectedUnit={selectedUnit}
            selectedUnitId={sellerForm.selectedUnitId}
            onSelectUnitId={(id, unitType) =>
              setSellerForm((s) => ({
                ...s,
                selectedUnitId: id,
                interestedIn:
                  id && !s.interestedIn.trim()
                    ? String(unitType || '').trim()
                    : s.interestedIn
              }))
            }
            filters={unitPickFilters}
            setFilters={setUnitPickFilters}
            selectionOnly
            projectParking={projectParking}
            projectPricing={projectPricing}
          />
          <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-ds-gray-800">
              Buyer preferences
            </p>
            <p className="mt-0.5 text-[11px] text-ds-gray-500">
              Selecting a unit qualifies this lead — the unit will be blocked in
              inventory until the deal closes or the enquiry is lost.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-ds-gray-600">
                  Interested in (type / layout)
                </Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. 2 BHK, corner, higher floor"
                  value={sellerForm.interestedIn}
                  onChange={(e) =>
                    setSellerForm((s) => ({
                      ...s,
                      interestedIn: e.target.value
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-ds-gray-600">
                    Budget min (₹)
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 text-xs"
                    placeholder="50,00,000"
                    value={sellerForm.budgetMin}
                    onChange={(e) =>
                      setSellerForm((s) => ({
                        ...s,
                        budgetMin: e.target.value
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-ds-gray-600">
                    Budget max (₹)
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 text-xs"
                    placeholder="80,00,000"
                    value={sellerForm.budgetMax}
                    onChange={(e) =>
                      setSellerForm((s) => ({
                        ...s,
                        budgetMax: e.target.value
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <StepUnitDetails
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          selectedUnit={selectedUnit}
          brokers={brokers}
          projectParking={projectParking}
          projectPricing={projectPricing}
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
            variant="ghost"
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
              className="gap-1.5"
              onClick={() => void goNext()}
              disabled={!stepValid[step] || saving}
            >
              {saving && step === 1
                ? 'Saving…'
                : step === 1
                  ? 'Save & next'
                  : step === 2
                    ? 'Next: details'
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
                {saving ? 'Saving…' : 'Save enquiry'}
              </Button>
              <Button
                type="button"
                disabled={!canSave || saving || !userLabel.id}
                onClick={() => void continueToBookingFromReview()}
                className="gap-1.5"
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
  budgetMin: string;
  budgetMax: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  selectedUnitId: string;
  notes: string;
};
type SetSellerForm = Dispatch<SetStateAction<SellerForm>>;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-ds-gray-500">{label}</dt>
      <dd className="text-right text-xs font-medium text-ds-gray-900">{value}</dd>
    </div>
  );
}

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
          : 'border-teal-200 bg-teal-50/60 text-teal-900'
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


// ─── Step 3: Unit details, parking, cost sheet ───────────────────────────────

function StepUnitDetails({
  sellerForm,
  setSellerForm,
  selectedUnit,
  brokers,
  projectParking,
  projectPricing
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  selectedUnit: UnitRow | null;
  brokers: { id: string; full_name: string }[];
  projectParking: ProjectParkingMeta | null;
  projectPricing: ProjectPricingMeta | null;
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
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Customer
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
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

      <SelectedUnitSummaryCard unit={u} />

      {(sellerForm.interestedIn.trim() ||
        sellerForm.budgetMin.trim() ||
        sellerForm.budgetMax.trim()) && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Preferences
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sellerForm.interestedIn.trim() ? (
              <SummaryRow
                label="Interested in"
                value={sellerForm.interestedIn.trim()}
              />
            ) : null}
            {sellerForm.budgetMin.trim() || sellerForm.budgetMax.trim() ? (
              <SummaryRow
                label="Budget"
                value={[
                  sellerForm.budgetMin.trim(),
                  sellerForm.budgetMax.trim()
                ]
                  .filter(Boolean)
                  .map((n) => `₹${Number(n).toLocaleString('en-IN')}`)
                  .join(' – ')}
              />
            ) : null}
          </dl>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">Parking</p>
        <ParkingInfoBar
          projectParking={projectParking}
          parkingRequired={sellerForm.parkingRequired}
          parkingCount={sellerForm.parkingCount}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-ds-gray-600">Extra parking?</Label>
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
            <Label className="text-xs text-ds-gray-600">How many slots?</Label>
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
      </div>

      <div>
        <Label className="text-xs text-ds-gray-600">Requirements / notes</Label>
        <Textarea
          value={sellerForm.notes}
          onChange={(e) =>
            setSellerForm((s) => ({ ...s, notes: e.target.value }))
          }
          rows={3}
          placeholder="Higher floor, corner, sea view, budget, Vastu…"
          className="mt-1 min-h-[72px] resize-y text-xs"
        />
      </div>

      <UnitCostSheet
        unit={u}
        parkingRequired={sellerForm.parkingRequired}
        parkingCount={sellerForm.parkingCount}
        projectParking={projectParking}
        projectPricing={projectPricing}
      />

      <p className="text-[11px] leading-snug text-muted-foreground">
        {unitStatusInquiryStageHint(u.status)}
      </p>
    </div>
  );
}

function SelectedUnitSummaryCard({ unit }: { unit: UnitRow }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ds-primary-200 bg-white shadow-sm">
      <div className="border-b border-ds-primary-100 bg-gradient-to-br from-ds-primary-50 to-white px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ds-primary-700">
          Selected unit
        </p>
        <h3 className="mt-1 text-lg font-bold text-ds-gray-900">{unit.unit_code}</h3>
        <p className="mt-1 text-xs text-ds-gray-600">
          {unit.project_name?.trim() || 'Project'} · {unit.wing_name || '—'} ·{' '}
          {formatFloorLabel(unit.floor, unit.unit_type)}
        </p>
        <p className="mt-1 text-xs text-ds-gray-600">
          {unit.unit_type?.trim() || '—'} · {statusLabelForUnit(unit.status)}
        </p>
      </div>
    </div>
  );
}
