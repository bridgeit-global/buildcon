'use client';

import { ArrowRight } from 'lucide-react';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { pageError, toast } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { datetimeLocalValue } from '@/lib/date-input-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { formControlFieldGapClass } from '@/components/ui/form-control';
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
  fetchActiveBookingForInquiry,
  INQUIRY_ACTIVE_BOOKING_MESSAGE,
  INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE,
  inquiryStagesLockedByUnitToken
} from './inquiry-booking-guard';
import {
  navigateToCreateBookingFromInquiry,
  type BuildBookingPrefillInput
} from './booking-prefill-from-inquiry';
import {
  formatFloorLabel,
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
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
import {
  funnelStageRank,
  INQUIRY_CLOSED_FUNNEL_STAGE,
  type InquiryFunnelStage
} from './inquiry-funnel-stages';
import type { UnitRow } from './inquiry-types';
import {
  buildProjectFilterOptions,
  DEFAULT_UNIT_PICK_FILTERS,
  InquiryUnitPicker,
  isUnitSelectableForQualifyPick,
  type UnitPickFilters,
  unitPickFiltersFromSellerPreferences
} from './inquiry-unit-picker';
import {
  inquirySiteVisitSchema,
  inquiryWizardStep1Schema,
  inquiryWizardStep2Schema,
  type InquiryWizardStep1Values
} from '@/lib/inquiry/inquiry-wizard.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { InquiryFollowUpBanner } from './inquiry-follow-up-banner';
import { followUpNeedsAttention } from '@/lib/inquiry/follow-up-due';

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

const wizardInputClass = 'text-sm';
const wizardFieldClass = cn(formControlFieldGapClass, wizardInputClass);
const wizardSelectTriggerClass = cn(formControlFieldGapClass, 'w-full text-sm');
const wizardTextareaClass = 'mt-1 min-h-16 resize-y text-sm';
const wizardLabelClass = 'text-sm text-ds-gray-600';

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
  /** When unit inventory is TOKEN — all wizard stages are view-only. */
  stagesReadOnly?: boolean;
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
    onSkipToStage,
    stagesReadOnly: stagesReadOnlyProp
  } = props;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLabel, setUserLabel] = useState<{ id: string; name: string }>({
    id: '',
    name: 'Logged-in user'
  });

  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>([]);
  const [accessibleProjects, setAccessibleProjects] = useState<
    { id: string; name: string }[]
  >([]);
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
    followUpDate: datetimeLocalValue(),
    notes: ''
  });

  const [createdInquiryId, setCreatedInquiryId] = useState('');
  const [persistedInquiryProjectId, setPersistedInquiryProjectId] = useState('');
  const [inquiryHeldUnitId, setInquiryHeldUnitId] = useState('');
  const [activelyPursuedUnitIds, setActivelyPursuedUnitIds] = useState<
    Set<string>
  >(() => new Set());
  const [visitInterest, setVisitInterest] = useState<SiteVisitInterest>('');
  const [negotiationOffer, setNegotiationOffer] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<
    'none' | 'pending' | 'approved' | 'rejected'
  >('none');
  const [latestApprovalId, setLatestApprovalId] = useState('');
  const [inquiryClosed, setInquiryClosed] = useState(false);
  const [closedStatus, setClosedStatus] = useState<string | null>(null);
  const [inquiryAssignedTo, setInquiryAssignedTo] = useState<string | null>(
    null
  );

  const activeInquiryId = String(inquiryIdProp || createdInquiryId || '').trim();
  const followUpAssignedToMe = Boolean(
    userLabel.id &&
    inquiryAssignedTo &&
    inquiryAssignedTo === userLabel.id
  );

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
        .select(
          `
          project_id,
          unit_id,
          funnel_stage,
          assigned_to,
          stage_data,
          lead_source,
          broker_id,
          interested_in,
          notes,
          customers ( full_name, phone, email )
        `
        )
        .eq('id', id)
        .maybeSingle();
      if (cancelled || loadErr || !data) return;
      const row = data as {
        project_id?: string;
        unit_id?: string;
        assigned_to?: string | null;
        lead_source?: string;
        broker_id?: string | null;
        interested_in?: string | null;
        notes?: string | null;
        customers?: { full_name?: string; phone?: string; email?: string | null } | null;
      };
      setCreatedInquiryId(id);
      setPersistedInquiryProjectId(String(row.project_id ?? '').trim());
      const unitId = String(row.unit_id || '').trim();
      setInquiryAssignedTo(String(row.assigned_to ?? '').trim() || null);
      const cust = row.customers;
      if (unitId) setInquiryHeldUnitId(unitId);
      if (unitId || cust) {
        setSellerForm((s) => ({
          ...s,
          ...(unitId ? { selectedUnitId: unitId } : {}),
          ...(cust
            ? {
              customerName: String(cust.full_name ?? '').trim(),
              phone: String(cust.phone ?? '').trim(),
              email: String(cust.email ?? '').trim()
            }
            : {}),
          leadSource: (LEAD_SOURCES as readonly string[]).includes(
            String(row.lead_source || '')
          )
            ? (row.lead_source as (typeof LEAD_SOURCES)[number])
            : s.leadSource,
          brokerId: String(row.broker_id ?? '').trim(),
          interestedIn: String(row.interested_in ?? '').trim(),
          notes: String(row.notes ?? '').trim()
        }));
      }
      const rowFunnelStage = String(
        (data as { funnel_stage?: string }).funnel_stage ?? ''
      ).trim();
      const stageData = (data as { stage_data?: Record<string, unknown> })
        .stage_data;
      setInquiryClosed(isInquiryClosed(stageData, rowFunnelStage));
      setClosedStatus(getInquiryClosedStatus(stageData));
      const { data: sd } = await loadInquiryStageData(supabase, id);
      const sv = sd?.site_visit as
        | { follow_up_date?: string; outcome?: string }
        | undefined;
      const siteFollowUp = String(sv?.follow_up_date ?? '').trim();
      if (siteFollowUp) {
        setSellerForm((s) => ({ ...s, followUpDate: siteFollowUp }));
      }
      const siteOutcome = String(sv?.outcome ?? '').trim();
      if (siteOutcome === 'Not Interested') {
        setVisitInterest('Not Interested');
      } else if (siteOutcome === 'Interested') {
        setVisitInterest('Interested');
      }
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
        if (!isInquiryClosed(stageData, rowFunnelStage)) {
          const closeResult = await closeInquiry(supabase, {
            inquiryId: id,
            unitId: unitId || null,
            closedStatus: 'Rejected'
          });
          if (closeResult.ok) {
            setInquiryClosed(true);
            setClosedStatus('Rejected');
            onFunnelStageChange?.(INQUIRY_CLOSED_FUNNEL_STAGE);
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
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });
      if (!cancelled) {
        setAccessibleProjects(
          ((data ?? []) as { id: string; name: string }[]).map((p) => ({
            id: String(p.id || '').trim(),
            name: String(p.name || '').trim() || 'Untitled project'
          }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('sales_inquiries')
        .select('unit_id, funnel_stage, stage_data')
        .not('unit_id', 'is', null);
      if (cancelled || error) return;
      const ids = new Set<string>();
      for (const row of data ?? []) {
        const r = row as {
          unit_id?: string | null;
          funnel_stage?: string | null;
          stage_data?: InquiryStageData | Record<string, unknown> | null;
        };
        const uid = String(r.unit_id ?? '').trim();
        if (!uid || isInquiryClosed(r.stage_data, r.funnel_stage)) continue;
        ids.add(uid);
      }
      setActivelyPursuedUnitIds(ids);
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
    () =>
      (units || []).filter(
        (u) =>
          isUnitAvailableForBooking(u.status) ||
          (isUnitBlockedStatus(u.status) && activelyPursuedUnitIds.has(u.id))
      ),
    [units, activelyPursuedUnitIds]
  );

  const applySellerPrefsToUnitFilters = useCallback(() => {
    setUnitPickFilters(
      unitPickFiltersFromSellerPreferences(selectableUnits, {
        interestedIn: sellerForm.interestedIn,
        preferredLocation: sellerForm.preferredLocation,
        preferredWing: sellerForm.preferredWing,
        budgetMin: sellerForm.budgetMin,
        budgetMax: sellerForm.budgetMax
      })
    );
  }, [
    selectableUnits,
    sellerForm.interestedIn,
    sellerForm.preferredLocation,
    sellerForm.preferredWing,
    sellerForm.budgetMin,
    sellerForm.budgetMax
  ]);

  const selectedUnit = useMemo(() => {
    const id = String(sellerForm.selectedUnitId || '').trim();
    if (!id) return null;
    return units.find((u) => u.id === id) ?? null;
  }, [units, sellerForm.selectedUnitId]);

  const resolveEnquiryProjectId = useCallback(() => {
    const fromPersisted = String(persistedInquiryProjectId || '').trim();
    if (fromPersisted) return fromPersisted;
    const fromUnit = String(selectedUnit?.project_id || '').trim();
    if (fromUnit) return fromUnit;
    const fromFilters = String(unitPickFilters.projectId || '').trim();
    if (fromFilters) return fromFilters;
    const prefFilters = unitPickFiltersFromSellerPreferences(selectableUnits, {
      interestedIn: sellerForm.interestedIn,
      preferredLocation: sellerForm.preferredLocation,
      preferredWing: sellerForm.preferredWing,
      budgetMin: sellerForm.budgetMin,
      budgetMax: sellerForm.budgetMax
    });
    const fromPrefs = String(prefFilters.projectId || '').trim();
    if (fromPrefs) return fromPrefs;
    const unitProjects = buildProjectFilterOptions(units);
    if (unitProjects.length === 1) return unitProjects[0][0];
    if (accessibleProjects.length === 1) return accessibleProjects[0].id;
    return '';
  }, [
    persistedInquiryProjectId,
    selectedUnit?.project_id,
    unitPickFilters.projectId,
    selectableUnits,
    sellerForm.interestedIn,
    sellerForm.preferredLocation,
    sellerForm.preferredWing,
    sellerForm.budgetMin,
    sellerForm.budgetMax,
    units,
    accessibleProjects
  ]);

  const stagesReadOnly =
    stagesReadOnlyProp ?? inquiryStagesLockedByUnitToken(selectedUnit?.status);

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

  const step1Values = useMemo(
    () => ({
      customerName: sellerForm.customerName,
      phone: sellerForm.phone,
      email: sellerForm.email,
      leadSource: sellerForm.leadSource,
      brokerId: sellerForm.brokerId
    }),
    [
      sellerForm.customerName,
      sellerForm.phone,
      sellerForm.email,
      sellerForm.leadSource,
      sellerForm.brokerId
    ]
  );

  const step1Validation = useFieldValidation(inquiryWizardStep1Schema, step1Values);
  const step2Validation = useFieldValidation(inquiryWizardStep2Schema, {
    selectedUnitId: sellerForm.selectedUnitId
  });
  const visitValidation = useFieldValidation(inquirySiteVisitSchema, {
    visitInterest: visitInterest || ''
  });

  const stepValid = useMemo(() => {
    const step1Ok =
      inquiryWizardStep1Schema.safeParse(step1Values).success &&
      Boolean(userLabel.id);
    return {
      1: step1Ok,
      2: step1Ok,
      3: Boolean(activeInquiryId)
    } as Record<StepId, boolean>;
  }, [step1Values, userLabel.id, activeInquiryId]);

  const persistCustomerToDb = useCallback(async (): Promise<string | null> => {
    if (!userLabel.id) {
      pageError('Sign in required to save customer details.');
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
      pageError(
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
      pageError(
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
    if (saving) return;
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    if (step === 1) {
      const parsed = step1Validation.validate();
      if (!parsed.success) {
        pageError('Fix the highlighted fields before continuing.');
        return;
      }
    }
    if (!stepValid[step]) return;
    if (step === 1) {
      setSaving(true);
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        applySellerPrefsToUnitFilters();
        const saved = await saveEnquiryRecord();
        if (!saved) return;
        changeStep(2);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 2) {
      await saveInquiryStep2();
      return;
    }
  }

  function goBack() {
    changeStep(Math.max(1, step - 1) as StepId);
  }

  async function gotoStep(target: StepId) {
    if (target === step || saving) return;
    if (stagesReadOnly && target !== step) return;
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
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        applySellerPrefsToUnitFilters();
        const saved = await saveEnquiryRecord();
        if (!saved) return;
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
      followUpDate: datetimeLocalValue(),
      notes: ''
    });
    setCreatedInquiryId('');
    setPersistedInquiryProjectId('');
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
        ? `Parking: ${sellerForm.parkingCount} slot(s)`
        : 'Parking: included only'
    ].filter(Boolean);
    return {
      follow_up_date: sellerForm.followUpDate.trim() || undefined,
      notes: parts.join(' · ') || undefined,
      cost_sheet_notes: sellerForm.notes.trim() || undefined
    };
  }

  async function saveEnquiryRecord(): Promise<boolean> {
    if (!userLabel.id) {
      pageError('Sign in required to save enquiry.');
      return false;
    }
    const inquiryProjectId = resolveEnquiryProjectId();
    if (!inquiryProjectId) {
      pageError(
        'Could not determine project. Enter a preferred location matching a project name, or pick a unit on the next step.'
      );
      return false;
    }
    const customerId = await persistCustomerToDb();
    if (!customerId) return false;

    const brokerId =
      sellerForm.leadSource === 'Broker' &&
        String(sellerForm.brokerId || '').trim()
        ? sellerForm.brokerId.trim()
        : null;

    const enquiryPayload = buildEnquiryStagePayload();
    const inquiryFields = {
      project_id: inquiryProjectId,
      customer_id: customerId,
      lead_source: sellerForm.leadSource,
      broker_id: brokerId,
      interested_in: sellerForm.interestedIn.trim() || null,
      notes: sellerForm.notes.trim() || null
    };

    try {
      let inquiryId = activeInquiryId;
      let persistedFunnelStage = 'Enquiry';
      if (inquiryId) {
        const { data: existing } = await supabase
          .from('sales_inquiries')
          .select('funnel_stage')
          .eq('id', inquiryId)
          .maybeSingle();
        persistedFunnelStage = String(
          existing?.funnel_stage ?? 'Enquiry'
        ).trim() || 'Enquiry';
        const { error: upErr } = await supabase
          .from('sales_inquiries')
          .update(inquiryFields)
          .eq('id', inquiryId);
        if (upErr) throw upErr;
      } else {
        const { data: inserted, error: inqErr } = await supabase
          .from('sales_inquiries')
          .insert({
            ...inquiryFields,
            unit_id: null,
            created_by: userLabel.id,
            assigned_to: userLabel.id
          })
          .select('id')
          .single();
        if (inqErr) throw inqErr;
        if (!inserted?.id) throw new Error('Inquiry insert returned no id');
        inquiryId = (inserted as { id: string }).id;
        setCreatedInquiryId(inquiryId);
        setPersistedInquiryProjectId(inquiryProjectId);
        setInquiryAssignedTo(userLabel.id);
        onCreated?.(inquiryId);
      }

      const stageResult = await saveInquiryStageData(supabase, {
        inquiryId,
        patch: { enquiry: enquiryPayload },
        funnelStage: 'Enquiry',
        markStagesCompleted: ['Enquiry']
      });
      if (!stageResult.ok) {
        throw new Error(stageResult.error ?? 'Failed to save enquiry stage');
      }

      const notifyStage =
        funnelStageRank(persistedFunnelStage) > funnelStageRank('Enquiry')
          ? persistedFunnelStage
          : 'Enquiry';
      onFunnelStageChange?.(notifyStage);
      toast.success('Enquiry saved.');
      onStageDataSaved?.();
      await onInquirySaved?.();
      return true;
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save enquiry');
      return false;
    }
  }

  async function saveInquiryStep2() {
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    if (!userLabel.id) return;

    const unitId = String(sellerForm.selectedUnitId || '').trim();
    const inquiryProjectId =
      String(selectedUnit?.project_id || '').trim() || resolveEnquiryProjectId();
    if (!inquiryProjectId) {
      pageError(
        'Could not determine project. Pick a unit or enter a preferred location matching a project name.'
      );
      return;
    }

    if (
      unitId &&
      (!selectedUnit ||
        !isUnitSelectableForQualifyPick(selectedUnit, inquiryHeldUnitId))
    ) {
      pageError(
        'Selected unit is not available — it may be held by another enquiry.'
      );
      return;
    }

    setSaving(true);
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;

      const brokerId =
        sellerForm.leadSource === 'Broker' &&
          String(sellerForm.brokerId || '').trim()
          ? sellerForm.brokerId.trim()
          : null;

      const rowFields = {
        project_id: inquiryProjectId,
        customer_id: customerId,
        unit_id: unitId || null,
        lead_source: sellerForm.leadSource,
        broker_id: brokerId,
        interested_in: sellerForm.interestedIn.trim() || null,
        notes: sellerForm.notes.trim() || null
      };

      let inquiryId = activeInquiryId;
      if (inquiryId) {
        const { error: upErr } = await supabase
          .from('sales_inquiries')
          .update(rowFields)
          .eq('id', inquiryId);
        if (upErr) throw upErr;
      } else {
        const saved = await saveEnquiryRecord();
        if (!saved) return;
        inquiryId = String(createdInquiryId || activeInquiryId || '').trim();
        if (!inquiryId) return;
        if (unitId) {
          const { error: linkErr } = await supabase
            .from('sales_inquiries')
            .update({ unit_id: unitId })
            .eq('id', inquiryId);
          if (linkErr) throw linkErr;
        }
      }

      const enquiryPayload = buildEnquiryStagePayload();

      if (!unitId) {
        const stageResult = await saveInquiryStageData(supabase, {
          inquiryId,
          patch: { enquiry: enquiryPayload },
          funnelStage: 'Enquiry',
          markStagesCompleted: ['Enquiry'],
          allowFunnelDowngrade: true
        });
        if (!stageResult.ok) {
          throw new Error(stageResult.error ?? 'Failed to save enquiry');
        }
        changeStep(3);
        onFunnelStageChange?.('Enquiry');
        toast.success('Enquiry saved — add a unit later to qualify.');
        onStageDataSaved?.();
        await onInquirySaved?.();
        return;
      }

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

      const qualResult = await qualifyInquiryWithUnit(supabase, {
        inquiryId,
        unitId,
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

      setCreatedInquiryId(inquiryId);
      await saveInquiryStageData(supabase, {
        inquiryId,
        patch: {
          site_visit: buildSiteVisitStagePayload()
        }
      });
      changeStep(3);
      onFunnelStageChange?.('Qualified');
      toast.success('Unit qualified — record the site visit when ready.');
      onStageDataSaved?.();
      onCreated?.(inquiryId);
      await onInquirySaved?.();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save inquiry');
    } finally {
      setSaving(false);
    }
  }

  function buildSiteVisitStagePayload(
    extra?: Record<string, unknown>
  ): InquiryStageData['site_visit'] {
    return {
      follow_up_date: sellerForm.followUpDate.trim() || undefined,
      notes: sellerForm.notes.trim() || undefined,
      ...extra
    };
  }

  async function persistVisitSiteStage(
    patch: Partial<InquiryStageData>,
    funnelStage?: InquiryFunnelStage
  ): Promise<boolean> {
    if (!activeInquiryId) return false;
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return false;
    }
    const result = await saveInquiryStageData(supabase, {
      inquiryId: activeInquiryId,
      patch,
      funnelStage
    });
    if (!result.ok) {
      pageError(result.error ?? 'Save failed');
      return false;
    }
    if (funnelStage) onFunnelStageChange?.(funnelStage);
    onStageDataSaved?.();
    return true;
  }

  function requireVisitInterestSelected(
    interest: SiteVisitInterest = visitInterest
  ) {
    const parsed = inquirySiteVisitSchema.safeParse({
      visitInterest: interest || ''
    });
    if (!parsed.success) {
      pageError('Select visit interest before continuing.');
      return false;
    }
    return true;
  }

  async function handleCloseAsNotInterested(
    interest: SiteVisitInterest = visitInterest
  ) {
    if (!activeInquiryId || saving) return;
    if (inquiryClosed && closedStatus === 'Not Interested') return;
    if (inquiryClosed) return;
    if (!requireVisitInterestSelected(interest)) return;
    setSaving(true);
    try {
      const { data: existingStage } = await loadInquiryStageData(
        supabase,
        activeInquiryId
      );
      const siteVisitPayload = buildSiteVisitStagePayload({
        outcome: 'Not Interested'
      });
      await persistVisitSiteStage({ site_visit: siteVisitPayload });
      const mergedStageData = {
        ...(existingStage ?? {}),
        site_visit: siteVisitPayload
      };
      const result = await closeInquiry(supabase, {
        inquiryId: activeInquiryId,
        unitId: sellerForm.selectedUnitId || null,
        stageData: mergedStageData,
        closedStatus: 'Not Interested'
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not close enquiry');
      setInquiryClosed(true);
      setClosedStatus('Not Interested');
      onFunnelStageChange?.(INQUIRY_CLOSED_FUNNEL_STAGE);
      toast.success('Enquiry closed. Unit released.');
      await onInquirySaved?.();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleVisitInterestChange(next: SiteVisitInterest) {
    setVisitInterest(next);
    visitValidation.touch('visitInterest');
    if (next === 'Not Interested') {
      if (inquiryClosed && closedStatus === 'Not Interested') return;
      await handleCloseAsNotInterested(next);
      return;
    }
    if (next === 'Interested') {
      if (inquiryClosed) return;
      if (activeInquiryId && !inquiryClosed && !stagesReadOnly) {
        await persistVisitSiteStage({
          site_visit: buildSiteVisitStagePayload({ outcome: 'Interested' })
        });
      }
    }
  }

  async function resolveInquiryCustomerId(): Promise<string | null> {
    if (!activeInquiryId) return null;
    const { data, error } = await supabase
      .from('sales_inquiries')
      .select('customer_id')
      .eq('id', activeInquiryId)
      .maybeSingle();
    if (error) {
      pageError(error.message);
      return null;
    }
    const id = String(
      (data as { customer_id?: string } | null)?.customer_id || ''
    ).trim();
    if (!id) {
      pageError(
        'This enquiry has no linked customer. Save customer details in the enquiry step first.'
      );
      return null;
    }
    return id;
  }

  async function handleCreateBookingFromVisit() {
    if (!activeInquiryId || saving) return;
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    if (!requireVisitInterestSelected()) return;
    const inquiryProjectId = String(selectedUnit?.project_id || '').trim();
    const uid = String(sellerForm.selectedUnitId || '').trim();
    if (!inquiryProjectId || !uid) return;
    const existingBooking = await fetchActiveBookingForInquiry(
      supabase,
      activeInquiryId
    );
    if (existingBooking) {
      pageError(INQUIRY_ACTIVE_BOOKING_MESSAGE);
      router.push(`/crm/bookings/${existingBooking.id}`);
      return;
    }
    if (
      negotiationBlocksTokenAdvance({
        approval_status: approvalStatus,
        approval_id: latestApprovalId,
        offered_price: negotiationOffer
      })
    ) {
      pageError(
        approvalStatus === 'pending'
          ? 'Budget approval is pending in the Negotiate stage. Check status there before creating a booking.'
          : 'Complete budget approval in the Negotiate stage before creating a booking.'
      );
      return;
    }
    setSaving(true);
    try {
      const customerId = await resolveInquiryCustomerId();
      if (!customerId) return;
      await persistVisitSiteStage({
        site_visit: buildSiteVisitStagePayload({ outcome: 'Interested' })
      });
      const prefill: BuildBookingPrefillInput = {
        inquiryId: activeInquiryId,
        projectId: inquiryProjectId,
        customerId,
        unitId: uid,
        parkingRequired: sellerForm.parkingRequired,
        parkingCount: sellerForm.parkingCount,
        parkingSlotsAvailable: projectParking?.parking_slots ?? null,
        parkingRateSnapshot: projectParking?.parking_rate ?? null
      };
      const { data: stageData } = await loadInquiryStageData(
        supabase,
        activeInquiryId
      );
      if (stageData) prefill.stageData = stageData;
      navigateToCreateBookingFromInquiry(router, prefill);
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Could not open create booking'
      );
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
      {stagesReadOnly ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
        >
          {INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE}
        </div>
      ) : null}

      {!hideStepper ? (
        <WizardStepper
          className="mt-4"
          steps={WIZARD_STEPS}
          currentIndex={step - 1}
          disabled={saving || stagesReadOnly}
          ariaLabel="New enquiry progress"
          isStepDone={(idx) => {
            const id = STEPS[idx]?.id;
            return id != null && id < step && stepValid[id];
          }}
          canSelectStep={() => !saving && !stagesReadOnly}
          onSelectStep={(_idx, s) => void gotoStep(Number(s.id) as StepId)}
        />
      ) : null}

      {step === 1 ? (
        <StepEnquiry
          sellerForm={sellerForm}
          setSellerForm={setSellerForm}
          brokers={brokers}
          signedIn={Boolean(userLabel.id)}
          fieldError={step1Validation.fieldError}
          touch={step1Validation.touch}
          readOnly={stagesReadOnly}
        />
      ) : null}

      {step === 2 ? (
        <div
          className={cn(
            'space-y-4',
            stagesReadOnly && 'pointer-events-none opacity-60'
          )}
        >
          <p className="text-xs text-ds-gray-600">
            Pick an available unit from the inventory grid, or continue without
            a unit. Blocked units with an active enquiry are shown for context.
            Selecting a unit qualifies the lead and blocks inventory.
          </p>
          <InquiryUnitPicker
            selectableUnits={selectableUnits}
            inquiryHeldUnitId={inquiryHeldUnitId || null}
            loadingUnits={loadingUnits}
            selectedUnit={selectedUnit}
            selectedUnitId={sellerForm.selectedUnitId}
            onSelectUnitId={(id, unitType) => {
              if (stagesReadOnly) return;
              setSellerForm((s) => ({
                ...s,
                selectedUnitId: id,
                interestedIn:
                  id && !s.interestedIn.trim()
                    ? String(unitType || '').trim()
                    : s.interestedIn
              }));
              step2Validation.touch('selectedUnitId');
            }}
            filters={unitPickFilters}
            setFilters={setUnitPickFilters}
            projectParking={projectParking}
            projectPricing={projectPricing}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
          />
          <FormFieldError message={step2Validation.fieldError('selectedUnitId')} />
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
          stagesReadOnly={stagesReadOnly}
          visitFieldError={visitValidation.fieldError('visitInterest')}
          followUpAssignedToMe={followUpAssignedToMe}
          onVisitInterestChange={(v) => void handleVisitInterestChange(v)}
          onFollowUpBlur={() => {
            if (!activeInquiryId || stagesReadOnly) return;
            if (inquiryClosed) return;
            void persistVisitSiteStage({
              site_visit: buildSiteVisitStagePayload()
            });
          }}
          onSkipToNegotiation={() => onSkipToStage?.('Negotiation')}
          onCreateBooking={() => void handleCreateBookingFromVisit()}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || saving || stagesReadOnly}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={resetForm}
            disabled={saving || stagesReadOnly}
          >
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!userLabel.id ? (
            <span className="text-xs text-amber-700">Sign in required.</span>
          ) : null}
          {step < 3 && !stagesReadOnly ? (
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => void goNext()}
              disabled={!stepValid[step] || saving}
            >
              {saving && (step === 1 || step === 2)
                ? 'Saving…'
                : step === 1
                  ? 'Save & next'
                  : step === 2
                    ? sellerForm.selectedUnitId.trim()
                      ? 'Save unit & continue'
                      : 'Save & continue'
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

const WIZARD_STEPS = STEPS.map((s) => ({
  id: String(s.id),
  label: s.label
}));

// ─── Step 1: Enquiry (customer + unit preferences) ───────────────────────────

function StepEnquiry({
  sellerForm,
  setSellerForm,
  brokers,
  signedIn,
  fieldError,
  touch,
  readOnly
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  brokers: { id: string; full_name: string }[];
  signedIn: boolean;
  fieldError: (field: keyof InquiryWizardStep1Values) => string | undefined;
  touch: (field: keyof InquiryWizardStep1Values) => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-5 space-y-4',
        readOnly && 'pointer-events-none opacity-60'
      )}
    >
      {!signedIn ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sign in to save and continue.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <FieldLabel className={wizardLabelClass} required>
            Customer name
          </FieldLabel>
          <Input
            className={wizardFieldClass}
            value={sellerForm.customerName}
            onChange={(e) => {
              setSellerForm((s) => ({ ...s, customerName: e.target.value }));
              touch('customerName');
            }}
            onBlur={() => touch('customerName')}
            aria-invalid={fieldError('customerName') ? true : undefined}
            placeholder="Full name"
          />
          <FormFieldError message={fieldError('customerName')} />
        </div>
        <PhoneInputField
          value={sellerForm.phone}
          onChange={(v) => {
            setSellerForm((s) => ({ ...s, phone: v }));
            touch('phone');
          }}
          label="Phone"
          required
          placeholder="10-digit mobile"
          mode="digits10"
          inputClassName={wizardInputClass}
          labelClassName={wizardLabelClass}
          error={fieldError('phone')}
        />
        <EmailInputField
          value={sellerForm.email}
          onChange={(v) => {
            setSellerForm((s) => ({ ...s, email: v }));
            touch('email');
          }}
          inputClassName={wizardInputClass}
          labelClassName={wizardLabelClass}
          error={fieldError('email')}
          placeholder="Email (optional)"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel className={wizardLabelClass} required>
            Lead source
          </FieldLabel>
          <Select
            value={sellerForm.leadSource}
            onValueChange={(v) => {
              const nv = v as (typeof LEAD_SOURCES)[number];
              setSellerForm((s) => ({
                ...s,
                leadSource: nv,
                brokerId: nv === 'Broker' ? s.brokerId : ''
              }));
              touch('leadSource');
            }}
          >
            <SelectTrigger className={wizardSelectTriggerClass}>
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
          <FieldLabel
            className={wizardLabelClass}
            required={sellerForm.leadSource === 'Broker'}
          >
            Broker
          </FieldLabel>
          <Select
            value={
              sellerForm.brokerId === '' ? undefined : sellerForm.brokerId
            }
            onValueChange={(v) => {
              setSellerForm((s) => ({ ...s, brokerId: v }));
              touch('brokerId');
            }}
            disabled={sellerForm.leadSource !== 'Broker'}
          >
            <SelectTrigger
              className={cn(
                wizardSelectTriggerClass,
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
          <FormFieldError message={fieldError('brokerId')} />
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
            <Label className={wizardLabelClass}>Unit type / layout</Label>
            <Input
              className={wizardFieldClass}
              placeholder="e.g. 2 BHK, corner, higher floor"
              value={sellerForm.interestedIn}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, interestedIn: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className={wizardLabelClass}>Preferred location / area</Label>
            <Input
              className={wizardFieldClass}
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
            <Label className={wizardLabelClass}>Budget (₹)</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                className={wizardFieldClass}
                placeholder="Min"
                aria-label="Budget minimum"
                value={sellerForm.budgetMin}
                onChange={(e) =>
                  setSellerForm((s) => ({ ...s, budgetMin: e.target.value }))
                }
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                className={wizardFieldClass}
                placeholder="Max"
                aria-label="Budget maximum"
                value={sellerForm.budgetMax}
                onChange={(e) =>
                  setSellerForm((s) => ({ ...s, budgetMax: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label className={wizardLabelClass}>Preferred wing / tower</Label>
            <Input
              className={wizardFieldClass}
              value={sellerForm.preferredWing}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, preferredWing: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className={wizardLabelClass}>Parking?</Label>
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
            <Label className={wizardLabelClass}>Parking slots</Label>
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
          <Label className={wizardLabelClass}>Other requirements</Label>
          <Textarea
            value={sellerForm.notes}
            onChange={(e) =>
              setSellerForm((s) => ({ ...s, notes: e.target.value }))
            }
            rows={3}
            className={wizardTextareaClass}
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
            'min-h-9 flex-1 px-4 py-2 text-sm font-medium transition-colors',
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
            'min-h-9 flex-1 px-3 py-2 text-sm font-medium transition-colors',
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
  onChange,
  disabled
}: {
  value: SiteVisitInterest;
  onChange: (v: SiteVisitInterest) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-md border border-border',
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      {(
        [
          { value: 'Interested' as const, label: 'Interested' },
          { value: 'Not Interested' as const, label: 'Not interested' }
        ]
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'min-h-9 flex-1 px-3 py-2 text-sm font-medium transition-colors',
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
  visitFieldError,
  onVisitInterestChange,
  followUpAssignedToMe,
  onFollowUpBlur,
  approvalStatus,
  inquiryClosed,
  closedStatus,
  tokenBlockedByApproval,
  saving,
  stagesReadOnly,
  onSkipToNegotiation,
  onCreateBooking
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  selectedUnit: UnitRow | null;
  visitInterest: SiteVisitInterest;
  setVisitInterest: (v: SiteVisitInterest) => void;
  visitFieldError?: string;
  onVisitInterestChange?: (v: SiteVisitInterest) => void;
  followUpAssignedToMe?: boolean;
  onFollowUpBlur?: () => void;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  inquiryClosed: boolean;
  closedStatus: string | null;
  tokenBlockedByApproval: boolean;
  saving: boolean;
  stagesReadOnly?: boolean;
  onSkipToNegotiation?: () => void;
  onCreateBooking?: () => void;
}) {
  const formDisabled = inquiryClosed || stagesReadOnly;
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
          className="rounded-lg border border-ds-gray-200 bg-ds-gray-50 px-3 py-3 text-xs text-ds-gray-800"
        >
          <p className="font-semibold text-ds-gray-800">
            Enquiry closed · {closedStatus ?? 'Closed'}
          </p>
          <p className="mt-1 text-[11px] text-ds-gray-600">
            Stage is Closed. The unit has been released to available inventory when
            applicable.
          </p>
        </div>
      ) : null}

      <SelectedUnitSummaryCard unit={selectedUnit} />

      {sellerForm.followUpDate.trim() && !formDisabled ? (
        <InquiryFollowUpBanner
          followUpDate={sellerForm.followUpDate}
          assignedToMe={followUpAssignedToMe}
        />
      ) : null}

      <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">Site visit</p>
        <p className="mt-0.5 text-[11px] text-ds-gray-500">
          Set a follow-up date for the assigned team member. Choosing{' '}
          <span className="font-medium">Not interested</span> closes the enquiry
          (Closed stage) and releases the unit.
        </p>
        <div className="mt-3 grid gap-3">
          <div>
            <Label className={wizardLabelClass}>Follow-up date</Label>
            <Input
              type="datetime-local"
              className={cn(
                wizardFieldClass,
                followUpAssignedToMe &&
                followUpNeedsAttention(sellerForm.followUpDate) &&
                'border-ds-primary-400 ring-1 ring-ds-primary-200'
              )}
              value={sellerForm.followUpDate}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, followUpDate: e.target.value }))
              }
              onBlur={() => onFollowUpBlur?.()}
              disabled={formDisabled}
            />
            {followUpAssignedToMe ? (
              <p className="mt-1 text-[11px] text-ds-primary-700">
                Shown on your Work queue follow-ups when due.
              </p>
            ) : null}
          </div>
          <div>
            <Label className={wizardLabelClass}>After visit</Label>
            <div className="mt-1">
              <InterestToggle
                value={visitInterest}
                onChange={(v) => onVisitInterestChange?.(v)}
                disabled={formDisabled || saving}
              />
            </div>
            <FormFieldError message={visitFieldError} />
          </div>
        </div>
      </div>

      {visitInterest === 'Not Interested' && !inquiryClosed && saving ? (
        <p className="text-xs text-ds-gray-600">Closing enquiry…</p>
      ) : null}

      {visitInterest === 'Interested' && !formDisabled ? (
        <div className="space-y-3 rounded-lg border border-ds-primary-200 bg-ds-primary-50/50 p-4">
          <p className="text-xs font-semibold text-ds-gray-800">
            Buyer liked the unit — choose next step
          </p>
          <p className="text-[11px] text-ds-gray-600">
            Start negotiation if price discussion is needed, or create a booking
            when they are ready to commit. Budget approval is handled in the
            Negotiate stage.
          </p>
          {tokenBlockedByApproval ? (
            <p className="text-[11px] text-amber-900">
              {approvalStatus === 'pending'
                ? 'Budget approval is pending in the Negotiate stage. Complete or refresh there before creating a booking.'
                : 'Complete budget approval in the Negotiate stage before creating a booking.'}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-ds-primary-300 text-ds-primary-700"
              disabled={saving}
              onClick={onSkipToNegotiation}
            >
              Negotiation
            </Button>
            <Button
              type="button"
              className="flex-1 gap-1 bg-teal-600 hover:bg-teal-700"
              disabled={saving || tokenBlockedByApproval}
              onClick={onCreateBooking}
            >
              Create booking
              <ArrowRight className="size-3.5 opacity-90" />
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
