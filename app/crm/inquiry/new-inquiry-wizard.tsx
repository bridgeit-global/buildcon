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
  type ProjectPricingMeta
} from '../booking-cost-utils';
import { writeBookingPrefill } from '../booking-prefill-storage';
import {
  formatFloorLabel,
  isUnitAvailableForBooking,
  statusLabelForUnit
} from '../inventory/inventory-utils';
import { unitStatusInquiryStageHint } from './inquiry-stage-unit-map';
import {
  applyUnitStatusForFunnelStage,
  closeInquiry,
  getInquiryClosedStatus,
  isInquiryClosed,
  negotiationBlocksTokenAdvance,
  qualifyInquiryWithUnit
} from './inquiry-stage-transitions';
import type { InquiryStageData } from './inquiry-types';
import { loadInquiryStageData, saveInquiryStageData } from './inquiry-stage-store';
import type { InquiryFunnelStage } from './inquiry-funnel-stages';
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
  { id: 1, label: 'Enquiry' },
  { id: 2, label: 'Qualified' },
  { id: 3, label: 'Visit site' }
] as const;
type StepId = (typeof STEPS)[number]['id'];

type SiteVisitInterest = 'Interested' | 'Not Interested' | '';

type NewInquiryWizardProps = {
  onInquirySaved?: () => void | Promise<void>;
  /** Called with the new inquiry id after step 2 (unit qualified). */
  onCreated?: (inquiryId: string) => void;
  /** Resume visit-site step for an existing enquiry. */
  inquiryId?: string;
  /** Notifies parent when the internal step changes (1–3). */
  onStepChange?: (step: number) => void;
  /** Parent-controlled wizard step (1–3). */
  forcedStep?: 1 | 2 | 3;
  /** When true the internal 3-step stepper is hidden (parent supplies its own progress indicator). */
  hideStepper?: boolean;
  onFunnelStageChange?: (stage: string) => void;
  onStageDataSaved?: () => void;
  onSkipToStage?: (stage: InquiryFunnelStage) => void;
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
  const {
    onInquirySaved,
    onCreated,
    onStepChange,
    hideStepper,
    inquiryId: inquiryIdProp,
    forcedStep,
    onFunnelStageChange,
    onStageDataSaved,
    onSkipToStage
  } = props;
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
    preferredLocation: '',
    preferredWing: '',
    budgetMin: '',
    budgetMax: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    followUpDate: '',
    notes: ''
  });

  const [createdInquiryId, setCreatedInquiryId] = useState('');
  const [visitInterest, setVisitInterest] = useState<SiteVisitInterest>('');
  const [negotiationOffer, setNegotiationOffer] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<
    'none' | 'pending' | 'approved' | 'rejected'
  >('none');
  const [latestApprovalId, setLatestApprovalId] = useState('');
  const [inquiryClosed, setInquiryClosed] = useState(false);
  const [closedStatus, setClosedStatus] = useState<string | null>(null);

  const activeInquiryId = String(inquiryIdProp || createdInquiryId || '').trim();

  const [internalStep, setInternalStep] = useState<StepId>(() =>
    inquiryIdProp ? 3 : 1
  );
  const step: StepId = forcedStep ?? internalStep;

  const changeStep = useCallback(
    (next: StepId) => {
      if (forcedStep == null) setInternalStep(next);
      onStepChange?.(next);
    },
    [forcedStep, onStepChange]
  );

  const [unitPickFilters, setUnitPickFilters] =
    useState<UnitPickFilters>(DEFAULT_UNIT_PICK_FILTERS);

  useEffect(() => {
    setSellerForm((s) => ({
      ...s,
      budgetMin: unitPickFilters.minBudget,
      budgetMax: unitPickFilters.maxBudget
    }));
  }, [unitPickFilters.minBudget, unitPickFilters.maxBudget]);

  useEffect(() => {
    const id = String(inquiryIdProp || '').trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const { data, error: loadErr } = await supabase
        .from('sales_inquiries')
        .select('unit_id, funnel_stage, stage_data')
        .eq('id', id)
        .maybeSingle();
      if (cancelled || loadErr || !data) return;
      const unitId = String((data as { unit_id?: string }).unit_id || '').trim();
      if (unitId) {
        setSellerForm((s) => ({ ...s, selectedUnitId: unitId }));
        setCreatedInquiryId(id);
      }
      const stageData = (data as { stage_data?: Record<string, unknown> })
        .stage_data;
      setInquiryClosed(isInquiryClosed(stageData));
      setClosedStatus(getInquiryClosedStatus(stageData));
      const { data: sd } = await loadInquiryStageData(supabase, id);
      const neg = sd?.negotiation as
        | {
          approval_status?: string;
          offered_price?: string;
          decision_note?: string;
          approval_id?: string;
        }
        | undefined;
      if (neg?.offered_price) {
        setNegotiationOffer(String(neg.offered_price));
        setVisitInterest('Interested');
      }
      if (neg?.approval_status === 'pending') setApprovalStatus('pending');
      if (neg?.approval_status === 'approved') setApprovalStatus('approved');
      if (neg?.approval_status === 'rejected') {
        setApprovalStatus('rejected');
        if (!isInquiryClosed(stageData)) {
          const closeResult = await closeInquiry(supabase, {
            inquiryId: id,
            unitId: unitId || null,
            closedStatus: 'Rejected'
          });
          if (closeResult.ok) {
            setInquiryClosed(true);
            setClosedStatus('Rejected');
          }
        }
      }
      if (neg?.approval_id) setLatestApprovalId(String(neg.approval_id));
      if (forcedStep == null) changeStep(3);
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiryIdProp, supabase, forcedStep, changeStep]);

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

  const canQualifyUnit = useMemo(() => {
    const brokerOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    return (
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      String(sellerForm.selectedUnitId || '').trim().length > 0 &&
      brokerOk &&
      Boolean(userLabel.id)
    );
  }, [sellerForm, userLabel.id]);

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
      2: unitOk && customerOk && leadOk,
      3: Boolean(activeInquiryId)
    } as Record<StepId, boolean>;
  }, [sellerForm, userLabel.id, activeInquiryId]);

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

  const continueToBooking = useCallback(async () => {
    const inquiryProjectId = String(selectedUnit?.project_id || '').trim();
    if (!canQualifyUnit || !inquiryProjectId || !selectedUnit) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;
      writeBookingPrefill({
        projectId: inquiryProjectId,
        inquiryId: activeInquiryId || null,
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
    canQualifyUnit,
    selectedUnit,
    persistCustomerToDb,
    sellerForm.selectedUnitId,
    sellerForm.parkingRequired,
    sellerForm.parkingCount,
    projectParking,
    activeInquiryId,
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
        changeStep(2);
        setSaveMsg('Customer saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 2) {
      await saveInquiryAndQualify();
      return;
    }
  }

  function goBack() {
    changeStep(Math.max(1, step - 1) as StepId);
  }

  async function gotoStep(target: StepId) {
    if (target === step || saving) return;
    if (target < step) {
      changeStep(target);
      return;
    }
    if (step === 1 && target > 1) {
      if (!stepValid[1]) {
        changeStep(1);
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
        changeStep(i as StepId);
        return;
      }
    }
    changeStep(target);
  }

  function resetForm() {
    setSellerForm({
      customerName: '',
      phone: '',
      email: '',
      leadSource: 'Direct',
      brokerId: '',
      interestedIn: '',
      preferredLocation: '',
      preferredWing: '',
      budgetMin: '',
      budgetMax: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      followUpDate: '',
      notes: ''
    });
    setCreatedInquiryId('');
    setVisitInterest('');
    setNegotiationOffer('');
    setApprovalStatus('none');
    changeStep(1);
    setUnitPickFilters(DEFAULT_UNIT_PICK_FILTERS);
  }

  function buildEnquiryStagePayload() {
    const parts = [
      sellerForm.interestedIn.trim()
        ? `Unit type: ${sellerForm.interestedIn.trim()}`
        : '',
      sellerForm.preferredLocation.trim()
        ? `Location: ${sellerForm.preferredLocation.trim()}`
        : '',
      sellerForm.preferredWing.trim()
        ? `Wing: ${sellerForm.preferredWing.trim()}`
        : '',
      sellerForm.parkingRequired === 'Yes'
        ? `Parking: ${sellerForm.parkingCount} extra slot(s)`
        : 'Parking: included only'
    ].filter(Boolean);
    return {
      follow_up_date: sellerForm.followUpDate.trim() || undefined,
      notes: parts.join(' · ') || undefined,
      cost_sheet_notes: sellerForm.notes.trim() || undefined
    };
  }

  async function saveInquiryAndQualify() {
    const inquiryProjectId = String(selectedUnit?.project_id || '').trim();
    if (!canQualifyUnit || !inquiryProjectId || !userLabel.id) return;
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
        sellerForm.preferredLocation.trim()
          ? `Preferred location: ${sellerForm.preferredLocation.trim()}`
          : '',
        sellerForm.notes.trim()
      ]
        .filter(Boolean)
        .join('\n');

      const enquiryPayload = buildEnquiryStagePayload();

      const qualResult = await qualifyInquiryWithUnit(supabase, {
        inquiryId,
        unitId: sellerForm.selectedUnitId,
        qualifiedPayload: {
          budget_min: sellerForm.budgetMin.trim() || undefined,
          budget_max: sellerForm.budgetMax.trim() || undefined,
          follow_up_date: sellerForm.followUpDate.trim() || undefined,
          notes: qualifiedNotes || undefined
        },
        enquiryPayload
      });
      if (!qualResult.ok) {
        throw new Error(qualResult.error ?? 'Failed to qualify enquiry');
      }

      const siteResult = await saveInquiryStageData(supabase, {
        inquiryId,
        patch: {},
        funnelStage: 'Site Visit'
      });
      if (!siteResult.ok) {
        throw new Error(siteResult.error ?? 'Failed to advance to site visit');
      }

      setCreatedInquiryId(inquiryId);
      changeStep(3);
      onFunnelStageChange?.('Site Visit');
      setSaveMsg('Unit qualified — continue with site visit.');
      window.setTimeout(() => setSaveMsg(''), 2500);
      onCreated?.(inquiryId);
      await onInquirySaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save inquiry');
    } finally {
      setSaving(false);
    }
  }

  async function persistVisitSiteStage(
    patch: Partial<InquiryStageData>,
    funnelStage?: InquiryFunnelStage
  ): Promise<boolean> {
    if (!activeInquiryId) return false;
    const result = await saveInquiryStageData(supabase, {
      inquiryId: activeInquiryId,
      patch,
      funnelStage
    });
    if (!result.ok) {
      setError(result.error ?? 'Save failed');
      return false;
    }
    if (funnelStage) onFunnelStageChange?.(funnelStage);
    onStageDataSaved?.();
    return true;
  }

  async function handleCloseAsNotInterested() {
    if (!activeInquiryId) return;
    setSaving(true);
    setError('');
    try {
      await persistVisitSiteStage({
        site_visit: {
          outcome: 'Not Interested',
          scheduled_at: sellerForm.followUpDate.trim() || undefined,
          notes: sellerForm.notes.trim() || undefined
        }
      });
      const result = await closeInquiry(supabase, {
        inquiryId: activeInquiryId,
        unitId: sellerForm.selectedUnitId || null
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not close enquiry');
      setInquiryClosed(true);
      setClosedStatus('Not Interested');
      setSaveMsg('Enquiry closed. Unit released to available.');
      window.setTimeout(() => setSaveMsg(''), 2500);
      await onInquirySaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setSaving(false);
    }
  }

  function canProceedToToken(): boolean {
    if (inquiryClosed) return false;
    if (negotiationBlocksTokenAdvance({ approval_status: approvalStatus, approval_id: latestApprovalId, offered_price: negotiationOffer })) {
      return false;
    }
    return true;
  }

  async function applyTokenStage(): Promise<boolean> {
    if (!activeInquiryId) return false;
    const ok = await persistVisitSiteStage(
      {
        site_visit: {
          outcome: 'Interested',
          scheduled_at: sellerForm.followUpDate.trim() || undefined
        }
      },
      'Token'
    );
    if (!ok) return false;
    const uid = String(sellerForm.selectedUnitId || '').trim();
    if (uid) {
      const unitResult = await applyUnitStatusForFunnelStage(
        supabase,
        uid,
        'Token'
      );
      if (unitResult.error) throw new Error(unitResult.error);
    }
    onSkipToStage?.('Token');
    setSaveMsg('Token recorded. Unit marked TOKEN in inventory.');
    window.setTimeout(() => setSaveMsg(''), 2500);
    await onInquirySaved?.();
    return true;
  }

  async function handleCustomerGaveToken() {
    if (!activeInquiryId || saving) return;
    if (!canProceedToToken()) {
      setError(
        approvalStatus === 'pending'
          ? 'Budget approval is pending in the Negotiate stage. Check status there before token.'
          : 'Complete budget approval in the Negotiate stage before token.'
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      await applyTokenStage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  const tokenBlockedByApproval = negotiationBlocksTokenAdvance({
    approval_status: approvalStatus,
    approval_id: latestApprovalId,
    offered_price: negotiationOffer
  });

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
        <StepEnquiry
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          brokers={brokers}
          signedIn={Boolean(userLabel.id)}
        />
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-xs text-ds-gray-600">
            Pick an available unit, review the cost sheet, then continue. The
            unit is blocked in inventory when you save.
          </p>
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
            projectParking={projectParking}
            projectPricing={projectPricing}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <StepVisitSite
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          selectedUnit={selectedUnit}
          visitInterest={visitInterest}
          setVisitInterest={setVisitInterest}
          approvalStatus={approvalStatus}
          inquiryClosed={inquiryClosed}
          closedStatus={closedStatus}
          tokenBlockedByApproval={tokenBlockedByApproval}
          saving={saving}
          onCloseNotInterested={() => void handleCloseAsNotInterested()}
          onSkipToNegotiation={() => onSkipToStage?.('Negotiation')}
          onSkipToToken={() => void handleCustomerGaveToken()}
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
                    ? 'Save unit & continue'
                    : 'Next'}
            </Button>
          ) : null}
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
  preferredLocation: string;
  preferredWing: string;
  budgetMin: string;
  budgetMax: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  selectedUnitId: string;
  followUpDate: string;
  notes: string;
};
type SetSellerForm = Dispatch<SetStateAction<SellerForm>>;

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

// ─── Step 1: Enquiry (customer + unit preferences) ───────────────────────────

function StepEnquiry({
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

      <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">
          What are they looking for?
        </p>
        <p className="mt-0.5 text-[11px] text-ds-gray-500">
          Unit type, budget, location, and parking — before you pick a unit.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-ds-gray-600">Unit type / layout</Label>
            <Input
              className="mt-1 h-9 text-xs"
              placeholder="e.g. 2 BHK, corner, higher floor"
              value={sellerForm.interestedIn}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, interestedIn: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">Preferred location / area</Label>
            <Input
              className="mt-1 h-9 text-xs"
              value={sellerForm.preferredLocation}
              onChange={(e) =>
                setSellerForm((s) => ({
                  ...s,
                  preferredLocation: e.target.value
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">Budget min (₹)</Label>
            <Input
              type="number"
              className="mt-1 h-9 text-xs"
              value={sellerForm.budgetMin}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, budgetMin: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">Budget max (₹)</Label>
            <Input
              type="number"
              className="mt-1 h-9 text-xs"
              value={sellerForm.budgetMax}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, budgetMax: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">Preferred wing / tower</Label>
            <Input
              className="mt-1 h-9 text-xs"
              value={sellerForm.preferredWing}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, preferredWing: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">First follow-up</Label>
            <Input
              type="datetime-local"
              className="mt-1 h-9 text-xs"
              value={sellerForm.followUpDate}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, followUpDate: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <Label className="text-xs text-ds-gray-600">Parking slots</Label>
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
        <div className="mt-3">
          <Label className="text-xs text-ds-gray-600">Other requirements</Label>
          <Textarea
            value={sellerForm.notes}
            onChange={(e) =>
              setSellerForm((s) => ({ ...s, notes: e.target.value }))
            }
            rows={2}
            className="mt-1 min-h-[60px] resize-y text-xs"
          />
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

function InterestToggle({
  value,
  onChange
}: {
  value: SiteVisitInterest;
  onChange: (v: SiteVisitInterest) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {(
        [
          { value: 'Interested' as const, label: 'Interested' },
          { value: 'Not Interested' as const, label: 'Not interested' }
        ]
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'min-h-11 flex-1 px-3 py-2 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Step 3: Site visit & outcomes ───────────────────────────────────────────

function StepVisitSite({
  sellerForm,
  setSellerForm,
  selectedUnit,
  visitInterest,
  setVisitInterest,
  approvalStatus,
  inquiryClosed,
  closedStatus,
  tokenBlockedByApproval,
  saving,
  onCloseNotInterested,
  onSkipToNegotiation,
  onSkipToToken
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  selectedUnit: UnitRow | null;
  visitInterest: SiteVisitInterest;
  setVisitInterest: (v: SiteVisitInterest) => void;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  inquiryClosed: boolean;
  closedStatus: string | null;
  tokenBlockedByApproval: boolean;
  saving: boolean;
  onCloseNotInterested: () => void;
  onSkipToNegotiation?: () => void;
  onSkipToToken?: () => void;
}) {
  if (!selectedUnit) {
    return (
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
        No unit on this enquiry. Go back to Qualified to pick a unit.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {inquiryClosed ? (
        <div
          role="status"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-800"
        >
          <p className="font-semibold text-ds-gray-800">
            Enquiry closed · {closedStatus ?? 'Closed'}
          </p>
          <p className="mt-1 text-[11px] text-ds-gray-600">
            The unit has been released to available inventory when applicable.
          </p>
        </div>
      ) : null}

      <SelectedUnitSummaryCard unit={selectedUnit} />

      <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">Site visit</p>
        <p className="mt-0.5 text-[11px] text-ds-gray-500">
          Record follow-up and whether the buyer is still interested after the
          visit.
        </p>
        <div className="mt-3 grid gap-3">
          <div>
            <Label className="text-xs text-ds-gray-600">Follow-up date</Label>
            <Input
              type="datetime-local"
              className="mt-1 h-9 text-xs"
              value={sellerForm.followUpDate}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, followUpDate: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-ds-gray-600">After visit</Label>
            <div className="mt-1">
              <InterestToggle
                value={visitInterest}
                onChange={setVisitInterest}
              />
            </div>
          </div>
        </div>
      </div>

      {visitInterest === 'Not Interested' && !inquiryClosed ? (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-4">
          <p className="text-xs font-semibold text-ds-gray-800">
            Close this enquiry
          </p>
          <p className="mt-1 text-[11px] text-ds-gray-600">
            Releases the unit from BLOCKED back to available inventory.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11 border-red-300 text-red-700 hover:bg-red-50"
            disabled={saving}
            onClick={onCloseNotInterested}
          >
            Close enquiry
          </Button>
        </div>
      ) : null}

      {visitInterest === 'Interested' && !inquiryClosed ? (
        <div className="space-y-3 rounded-lg border border-ds-primary-200 bg-ds-primary-50/50 p-4">
          <p className="text-xs font-semibold text-ds-gray-800">
            Buyer liked the unit — choose next step
          </p>
          <p className="text-[11px] text-ds-gray-600">
            Start negotiation if price discussion is needed, or go straight to
            token if they are ready to commit. Budget approval is handled in the
            Negotiate stage.
          </p>
          {tokenBlockedByApproval ? (
            <p className="text-[11px] text-amber-900">
              {approvalStatus === 'pending'
                ? 'Budget approval is pending in the Negotiate stage. Complete or refresh there before token.'
                : 'Complete budget approval in the Negotiate stage before token.'}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 border-ds-primary-300 text-ds-primary-700"
              disabled={saving}
              onClick={onSkipToNegotiation}
            >
              Negotiation
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1 bg-teal-600 hover:bg-teal-700"
              disabled={saving || tokenBlockedByApproval}
              onClick={onSkipToToken}
            >
              Skip to token
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] leading-snug text-muted-foreground">
        {unitStatusInquiryStageHint(selectedUnit.status)}
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
