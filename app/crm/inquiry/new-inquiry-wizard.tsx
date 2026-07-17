'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { pageError, toast } from '@/lib/toast';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { datetimeLocalValueNextWeek } from '@/lib/date-input-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { TextInputField } from '@/components/ui/text-input-field';
import { DateTimeInputField } from '@/components/ui/datetime-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';
import { isPhoneLengthValidForCountry } from '@/lib/form/common-fields';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import { formatFloorLabel, statusLabelForUnit } from '../inventory/inventory-utils';
import { unitStatusInquiryStageHint } from './inquiry-stage-unit-map';
import {
  applyUnitStatusForFunnelStage,
  closeInquiry,
  getInquiryClosedStatus,
  isInquiryClosed,
  negotiationBlocksTokenAdvance,
  qualifyInquiryWithUnit,
  reopenInquiryAfterBudgetApproval
} from './inquiry-stage-transitions';
import type { InquiryStageData } from './inquiry-types';
import {
  loadInquiryStageData,
  negotiationApprovalStatusFromDb,
  saveInquiryStageData
} from './inquiry-stage-store';
import {
  funnelStageRank,
  INQUIRY_CLOSED_FUNNEL_STAGE,
  inquiryWizardStepForView,
  type InquiryFunnelStage,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';
import type { UnitRow } from './inquiry-types';
import {
  buildProjectFilterOptions,
  DEFAULT_UNIT_PICK_FILTERS,
  ensureDefaultProjectOnFilters,
  InquiryUnitPicker,
  isUnitSelectableForQualifyPick,
  type UnitPickFilters,
  type InquiryProjectPickOption,
  unitPickFiltersFromSellerPreferences
} from './inquiry-unit-picker';
import {
  inquirySiteVisitSchema,
  inquiryWizardStep1Schema,
  inquiryWizardStep2Schema,
  type InquiryWizardStep1Values
} from '@/lib/inquiry/inquiry-wizard.schema';
import { FormFieldError } from '@/components/ui/form-field-error';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { InquiryFollowUpBanner } from './inquiry-follow-up-banner';
import { followUpNeedsAttention } from '@/lib/inquiry/follow-up-due';
import { normalizeLeadSource, persistedLeadSourceValue, resolveLeadSourceFormState } from '@/lib/inquiry/lead-source';
import { mergeLookupOptions } from '@/lib/master/master-lookup';
import { useMasterLookup } from '@/lib/master/use-master-lookup';
import { namePartsFromFullName } from '@/lib/person-name';
import {
  buildWizardUiDraftPayload,
  parseInquiryWizardUi,
  saveInquiryWizardUi
} from './inquiry-wizard-ui';
import {
  useInquiryWizardStore,
  type WizardNavigationRequest
} from '@/store/inquiry-wizard-store';
import {
  wizardSnapshotsEqual,
  wizardStepLabel,
  type WizardStep1Snapshot,
  type WizardStep2Snapshot,
  type WizardStep3Snapshot,
  type WizardStepId
} from './inquiry-wizard-snapshots';

function normalizePhone(p: string) {
  return String(p || '').replace(/\D/g, '');
}

type ExistingCustomerMatch = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_country: string | null;
};

const STEPS = [
  { id: 1, label: 'Enquiry' },
  { id: 2, label: 'Qualified' },
  { id: 3, label: 'Visit site' }
] as const;
type StepId = WizardStepId;

export type NewInquiryWizardHandle = {
  tryGoToStep: (target: StepId) => Promise<boolean>;
  tryGoToPipelineStage: (stage: InquiryPipelineUiStage) => Promise<boolean>;
  hasUnsavedChanges: () => boolean;
};

function buildStep1SnapshotFromForm(form: {
  customerName: string;
  phone: string;
  phoneCountry: string;
  email: string;
  leadSource: string;
  leadSourceOther: string;
  brokerId: string;
  interestedIn: string;
  preferredLocation: string;
  preferredWing: string;
  budgetMin: string;
  budgetMax: string;
  parkingRequired: string;
  parkingCount: string;
  followUpDate: string;
  notes: string;
}): WizardStep1Snapshot {
  return {
    customerName: form.customerName,
    phone: form.phone,
    phoneCountry: form.phoneCountry,
    email: form.email,
    leadSource: form.leadSource,
    leadSourceOther: form.leadSourceOther,
    brokerId: form.brokerId,
    interestedIn: form.interestedIn,
    preferredLocation: form.preferredLocation,
    preferredWing: form.preferredWing,
    budgetMin: form.budgetMin,
    budgetMax: form.budgetMax,
    parkingRequired: form.parkingRequired,
    parkingCount: form.parkingCount,
    followUpDate: form.followUpDate,
    notes: form.notes
  };
}

const wizardInputClass = 'text-sm';
const wizardFieldClass = cn(formControlFieldGapClass, wizardInputClass);
const wizardSelectTriggerClass = cn(formControlFieldGapClass, 'w-full text-sm');
const wizardTextareaClass = 'mt-1 min-h-16 resize-y text-sm';
const wizardLabelClass = 'text-sm text-ds-gray-600';

type SiteVisitInterest = 'Interested' | 'Not Interested' | '';

type NewInquiryWizardProps = {
  onInquirySaved?: () => void | Promise<void>;
  /** Called after a newly created enquiry and its Enquiry stage are persisted. */
  onCreated?: (inquiryId: string) => void | Promise<void>;
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
  onSkipToStage?: (stage: InquiryFunnelStage) => void | Promise<void>;
  /** Persisted funnel stage from the parent (for pipeline step mapping). */
  funnelStage?: string;
  /** When unit inventory is TOKEN — all wizard stages are view-only. */
  stagesReadOnly?: boolean;
  /** Fired when the wizard has unsaved changes. */
  onUnsavedChange?: (unsaved: boolean) => void;
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

export const NewInquiryWizard = forwardRef<
  NewInquiryWizardHandle,
  NewInquiryWizardProps
>(function NewInquiryWizard(props, ref) {
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
    funnelStage: funnelStageProp,
    stagesReadOnly: stagesReadOnlyProp,
    onUnsavedChange
  } = props;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const hasUnsavedChanges = useInquiryWizardStore((s) => s.hasUnsavedChanges);
  const savedSnapshots = useInquiryWizardStore((s) => s.savedSnapshots);
  const draftSnapshots = useInquiryWizardStore((s) => s.draftSnapshots);
  const navConfirmOpen = useInquiryWizardStore((s) => s.navConfirmOpen);
  const navConfirmSaving = useInquiryWizardStore((s) => s.navConfirmSaving);
  const syncDraftStep1 = useInquiryWizardStore((s) => s.syncDraftStep1);
  const syncDraftStep2 = useInquiryWizardStore((s) => s.syncDraftStep2);
  const syncDraftStep3 = useInquiryWizardStore((s) => s.syncDraftStep3);
  const hydrateWithPersistedDrafts = useInquiryWizardStore(
    (s) => s.hydrateWithPersistedDrafts
  );
  const markStepSaved = useInquiryWizardStore((s) => s.markStepSaved);
  const resetWizardState = useInquiryWizardStore((s) => s.resetWizardState);
  const openNavConfirm = useInquiryWizardStore((s) => s.openNavConfirm);
  const takeNavPending = useInquiryWizardStore((s) => s.takeNavPending);
  const setNavConfirmOpen = useInquiryWizardStore((s) => s.setNavConfirmOpen);
  const setNavConfirmSaving = useInquiryWizardStore((s) => s.setNavConfirmSaving);
  const takeNavigationRequest = useInquiryWizardStore((s) => s.takeNavigationRequest);
  const navigationRequest = useInquiryWizardStore((s) => s.navigationRequest);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLabel, setUserLabel] = useState<{ id: string; name: string }>({
    id: '',
    name: 'Logged-in user'
  });

  const {
    items: masterLeadSourceItems,
    activeNames: masterLeadSources,
    reload: reloadLeadSources
  } = useMasterLookup('lead_source');
  const { activeNames: masterUnitTypes } = useMasterLookup('unit_type');
  const leadSourceOptions = useMemo(
    () => masterLeadSources,
    [masterLeadSources]
  );
  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>([]);
  const [unitTypeNames, setUnitTypeNames] = useState<string[]>([]);
  const [accessibleProjects, setAccessibleProjects] = useState<
    InquiryProjectPickOption[]
  >([]);
  const [projectParking, setProjectParking] =
    useState<ProjectParkingMeta | null>(null);
  const [projectPricing, setProjectPricing] =
    useState<ProjectPricingMeta | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [existingCustomerMatches, setExistingCustomerMatches] = useState<
    ExistingCustomerMatch[]
  >([]);
  const [existingCustomerPickerOpen, setExistingCustomerPickerOpen] =
    useState(false);
  const [existingCustomerLookupLoading, setExistingCustomerLookupLoading] =
    useState(false);
  const phoneLookupAttemptedRef = useRef('');
  const phoneLookupInFlightRef = useRef('');
  const phoneLookupSuppressedRef = useRef(false);
  const wizardUiHydratingRef = useRef(false);

  const [sellerForm, setSellerForm] = useState({
    customerName: '',
    phone: '',
    phoneCountry: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: '',
    leadSource: 'Direct',
    leadSourceOther: '',
    brokerId: '',
    projectId: '',
    interestedIn: '',
    preferredLocation: '',
    preferredWing: '',
    budgetMin: '',
    budgetMax: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    followUpDate: datetimeLocalValueNextWeek(),
    notes: ''
  });

  const [createdInquiryId, setCreatedInquiryId] = useState('');
  const [persistedInquiryProjectId, setPersistedInquiryProjectId] = useState('');
  const [inquiryHeldUnitId, setInquiryHeldUnitId] = useState('');
  const [visitInterest, setVisitInterest] = useState<SiteVisitInterest>('');
  const [notInterestedConfirmOpen, setNotInterestedConfirmOpen] = useState(false);
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

  useEffect(() => {
    syncDraftStep1(buildStep1SnapshotFromForm(sellerForm));
  }, [sellerForm, syncDraftStep1]);

  useEffect(() => {
    syncDraftStep2({
      selectedUnitId: sellerForm.selectedUnitId,
      projectId: sellerForm.projectId
    });
  }, [sellerForm.selectedUnitId, sellerForm.projectId, syncDraftStep2]);

  useEffect(() => {
    syncDraftStep3({
      visitInterest: visitInterest || '',
      followUpDate: sellerForm.followUpDate,
      notes: sellerForm.notes
    });
  }, [visitInterest, sellerForm.followUpDate, sellerForm.notes, syncDraftStep3]);

  const applySnapshotToForm = useCallback(
    (
      target: StepId,
      snap: WizardStep1Snapshot | WizardStep2Snapshot | WizardStep3Snapshot
    ) => {
      if (target === 1) {
        const s1 = snap as WizardStep1Snapshot;
        setSellerForm((s) => ({
          ...s,
          customerName: s1.customerName,
          phone: s1.phone,
          phoneCountry:
            String(s1.phoneCountry ?? '').trim() ||
            DEFAULT_COUNTRY_DIAL_CODE_OPTION,
          email: s1.email,
          leadSource: s1.leadSource,
          leadSourceOther: s1.leadSourceOther ?? '',
          brokerId: s1.brokerId,
          interestedIn: s1.interestedIn,
          preferredLocation: s1.preferredLocation,
          preferredWing: s1.preferredWing,
          budgetMin: s1.budgetMin,
          budgetMax: s1.budgetMax,
          parkingRequired: s1.parkingRequired as SellerForm['parkingRequired'],
          parkingCount: s1.parkingCount,
          followUpDate: s1.followUpDate,
          notes: s1.notes
        }));
        return;
      }
      if (target === 2) {
        const s2 = snap as WizardStep2Snapshot;
        setSellerForm((s) => ({
          ...s,
          selectedUnitId: s2.selectedUnitId,
          projectId: String(s2.projectId || '').trim() || s.projectId
        }));
        return;
      }
      const s3 = snap as WizardStep3Snapshot;
      setVisitInterest((s3.visitInterest || '') as SiteVisitInterest);
      setSellerForm((s) => ({
        ...s,
        followUpDate: s3.followUpDate,
        notes: s3.notes
      }));
    },
    []
  );

  const revertStepToSaved = useCallback(
    (target: StepId) => {
      applySnapshotToForm(target, savedSnapshots[target]);
    },
    [savedSnapshots, applySnapshotToForm]
  );

  const isCurrentStepUnsaved = useCallback(
    () =>
      !wizardSnapshotsEqual(draftSnapshots[step], savedSnapshots[step]),
    [draftSnapshots, savedSnapshots, step]
  );

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [onUnsavedChange, hasUnsavedChanges]);

  useEffect(() => {
    if (!activeInquiryId) return;
    const timer = window.setTimeout(() => {
      if (wizardUiHydratingRef.current) return;
      const state = useInquiryWizardStore.getState();
      const payload = buildWizardUiDraftPayload(
        state.savedSnapshots,
        state.draftSnapshots
      );
      void saveInquiryWizardUi(supabase, activeInquiryId, payload);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeInquiryId, supabase, draftSnapshots, hasUnsavedChanges]);

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
    if (accessibleProjects.length === 0) return;
    const sorted = [...accessibleProjects].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    const defaultId = sorted[0].id;
    setSellerForm((s) =>
      String(s.projectId || '').trim() ? s : { ...s, projectId: defaultId }
    );
  }, [accessibleProjects]);

  useEffect(() => {
    const pid = String(sellerForm.projectId || '').trim();
    if (!pid) return;
    setUnitPickFilters((f) =>
      f.projectId === pid ? f : { ...f, projectId: pid }
    );
  }, [sellerForm.projectId]);

  useEffect(() => {
    const pid = String(unitPickFilters.projectId || '').trim();
    if (!pid) return;
    setSellerForm((s) => (s.projectId === pid ? s : { ...s, projectId: pid }));
  }, [unitPickFilters.projectId]);

  useEffect(() => {
    const id = String(inquiryIdProp || '').trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      wizardUiHydratingRef.current = true;
      const { data, error: loadErr } = await supabase
        .from('sales_inquiries')
        .select(
          `
          project_id,
          unit_id,
          funnel_stage,
          assigned_to,
          stage_data,
          wizard_ui,
          lead_source,
          broker_id,
          interested_in,
          notes,
          customers ( full_name, phone, phone_country, email )
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
        customers?: {
          full_name?: string;
          phone?: string;
          phone_country?: string | null;
          email?: string | null;
        } | null;
      };
      setCreatedInquiryId(id);
      setPersistedInquiryProjectId(String(row.project_id ?? '').trim());
      const unitId = String(row.unit_id || '').trim();
      setInquiryAssignedTo(String(row.assigned_to ?? '').trim() || null);
      const cust = row.customers;
      const normalizedLeadSource = normalizeLeadSource(String(row.lead_source || ''));
      const leadSourceState = resolveLeadSourceFormState(
        normalizedLeadSource,
        leadSourceOptions
      );
      if (unitId) setInquiryHeldUnitId(unitId);
      if (unitId || cust) {
        setSellerForm((s) => ({
          ...s,
          ...(unitId ? { selectedUnitId: unitId } : {}),
          projectId: String(row.project_id ?? '').trim() || s.projectId,
          ...(cust
            ? {
              customerName: String(cust.full_name ?? '').trim(),
              phone: String(cust.phone ?? '').trim(),
              phoneCountry:
                String(cust.phone_country ?? '').trim() ||
                DEFAULT_COUNTRY_DIAL_CODE_OPTION,
              email: String(cust.email ?? '').trim()
            }
            : {}),
          leadSource: leadSourceState.leadSource,
          leadSourceOther: leadSourceState.leadSourceOther,
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
      const enquiry = (sd?.enquiry ?? {}) as {
        preferred_location?: string;
        preferred_wing?: string;
        budget_min?: string;
        budget_max?: string;
        parking_required?: 'Yes' | 'No';
        parking_count?: string;
      };
      setSellerForm((s) => ({
        ...s,
        preferredLocation: String(enquiry.preferred_location ?? '').trim(),
        preferredWing: String(enquiry.preferred_wing ?? '').trim(),
        budgetMin: String(enquiry.budget_min ?? '').trim(),
        budgetMax: String(enquiry.budget_max ?? '').trim(),
        parkingRequired: enquiry.parking_required === 'Yes' ? 'Yes' : 'No',
        parkingCount: String(enquiry.parking_count ?? '').trim() || '1'
      }));
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
      if (neg?.approval_status === 'approved') {
        setApprovalStatus('approved');
        const reopen = await reopenInquiryAfterBudgetApproval(supabase, id);
        if (
          reopen.ok &&
          isInquiryClosed(stageData, rowFunnelStage) &&
          getInquiryClosedStatus(stageData, rowFunnelStage) === 'Rejected'
        ) {
          setInquiryClosed(false);
          setClosedStatus(null);
          onFunnelStageChange?.('Negotiation');
        }
      }
      if (neg?.approval_status === 'rejected') {
        let effectiveRejected = true;
        const approvalId = String(neg.approval_id ?? '').trim();
        if (approvalId) {
          const { data: approvalRow } = await supabase
            .from('negotiation_approvals')
            .select('status')
            .eq('id', approvalId)
            .maybeSingle();
          const dbStatus = negotiationApprovalStatusFromDb(
            (approvalRow as { status?: string } | null)?.status
          );
          if (dbStatus === 'approved') {
            setApprovalStatus('approved');
            effectiveRejected = false;
            await reopenInquiryAfterBudgetApproval(supabase, id);
          } else if (dbStatus === 'pending') {
            setApprovalStatus('pending');
            effectiveRejected = false;
          }
        }
        if (effectiveRejected) {
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
      }
      if (neg?.approval_id) setLatestApprovalId(String(neg.approval_id));
      const custName = String(cust?.full_name ?? '').trim();
      const custPhone = String(cust?.phone ?? '').trim();
      const custPhoneCountry =
        String(cust?.phone_country ?? '').trim() ||
        DEFAULT_COUNTRY_DIAL_CODE_OPTION;
      const custEmail = String(cust?.email ?? '').trim();
      const projectIdValue = String(row.project_id ?? '').trim();
      const notesValue = String(row.notes ?? '').trim();
      const visitOutcome =
        siteOutcome === 'Not Interested'
          ? 'Not Interested'
          : siteOutcome === 'Interested'
            ? 'Interested'
            : '';
      if (custPhone) {
        phoneLookupSuppressedRef.current = true;
      }
      const savedSnapshotsPayload = {
        1: {
          customerName: custName,
          phone: custPhone,
          phoneCountry: custPhoneCountry,
          email: custEmail,
          leadSource: leadSourceState.leadSource,
          leadSourceOther: leadSourceState.leadSourceOther,
          brokerId: String(row.broker_id ?? '').trim(),
          interestedIn: String(row.interested_in ?? '').trim(),
          preferredLocation: String(enquiry.preferred_location ?? '').trim(),
          preferredWing: String(enquiry.preferred_wing ?? '').trim(),
          budgetMin: String(enquiry.budget_min ?? '').trim(),
          budgetMax: String(enquiry.budget_max ?? '').trim(),
          parkingRequired: enquiry.parking_required === 'Yes' ? 'Yes' : 'No',
          parkingCount: String(enquiry.parking_count ?? '').trim() || '1',
          followUpDate: siteFollowUp || datetimeLocalValueNextWeek(),
          notes: notesValue
        },
        2: {
          selectedUnitId: unitId,
          projectId: projectIdValue
        },
        3: {
          visitInterest: visitOutcome,
          followUpDate: siteFollowUp || datetimeLocalValueNextWeek(),
          notes: notesValue
        }
      } as const;
      const wizardUi = parseInquiryWizardUi(
        (data as { wizard_ui?: unknown }).wizard_ui
      );
      hydrateWithPersistedDrafts({
        saved: savedSnapshotsPayload,
        drafts: wizardUi.drafts
      });
      const { savedSnapshots: restoredSaved, draftSnapshots: restoredDrafts } =
        useInquiryWizardStore.getState();
      for (const step of [1, 2, 3] as const) {
        if (
          !wizardSnapshotsEqual(restoredDrafts[step], restoredSaved[step])
        ) {
          applySnapshotToForm(step, restoredDrafts[step]);
        }
      }
      wizardUiHydratingRef.current = false;
      if (forcedStep == null) changeStep(3);
    })();
    return () => {
      cancelled = true;
      wizardUiHydratingRef.current = false;
    };
  }, [
    inquiryIdProp,
    supabase,
    forcedStep,
    changeStep,
    hydrateWithPersistedDrafts,
    applySnapshotToForm,
    leadSourceOptions
  ]);

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
        .select('id, name, location')
        .order('name', { ascending: true });
      if (!cancelled) {
        setAccessibleProjects(
          ((data ?? []) as {
            id: string;
            name: string;
            location?: string | null;
          }[]).map((p) => ({
            id: String(p.id || '').trim(),
            name: String(p.name || '').trim() || 'Untitled project',
            location: String(p.location ?? '').trim() || null
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
      const { data } = await supabase
        .from('project_unit_types')
        .select('name')
        .order('sort_order', { ascending: true });
      if (!cancelled) {
        const names = [
          ...new Set(
            ((data ?? []) as { name: string }[])
              .map((t) => String(t.name || '').trim())
              .filter(Boolean)
          )
        ].sort((a, b) => a.localeCompare(b));
        setUnitTypeNames(names);
      }
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

  const unitTypeOptions = useMemo(() => {
    const fromUnits = units.map((u) => u.unit_type);
    return mergeLookupOptions(masterUnitTypes, [...unitTypeNames, ...fromUnits]);
  }, [units, unitTypeNames, masterUnitTypes]);

  const canQualifyUnit = useMemo(() => {
    const brokerOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    return (
      String(sellerForm.customerName || '').trim().length >= 2 &&
      isPhoneLengthValidForCountry(sellerForm.phone, sellerForm.phoneCountry) &&
      String(sellerForm.selectedUnitId || '').trim().length > 0 &&
      brokerOk &&
      Boolean(userLabel.id)
    );
  }, [sellerForm, userLabel.id]);

  const applySellerPrefsToUnitFilters = useCallback((): UnitPickFilters => {
    const fromPrefs = unitPickFiltersFromSellerPreferences(
      units,
      {
        interestedIn: sellerForm.interestedIn,
        preferredLocation: sellerForm.preferredLocation,
        preferredWing: sellerForm.preferredWing,
        budgetMin: sellerForm.budgetMin,
        budgetMax: sellerForm.budgetMax
      },
      accessibleProjects
    );
    const explicitProject = String(sellerForm.projectId || '').trim();
    const next: UnitPickFilters = ensureDefaultProjectOnFilters(
      {
        ...fromPrefs,
        projectId: explicitProject || fromPrefs.projectId
      },
      units,
      accessibleProjects
    );
    setUnitPickFilters(next);
    const pid = String(next.projectId || '').trim();
    if (pid) {
      setSellerForm((s) => (s.projectId === pid ? s : { ...s, projectId: pid }));
    }
    return next;
  }, [
    units,
    accessibleProjects,
    sellerForm.projectId,
    sellerForm.interestedIn,
    sellerForm.preferredLocation,
    sellerForm.preferredWing,
    sellerForm.budgetMin,
    sellerForm.budgetMax
  ]);

  useEffect(() => {
    if (step !== 2) return;
    applySellerPrefsToUnitFilters();
  }, [step, applySellerPrefsToUnitFilters]);

  useLayoutEffect(() => {
    if (step !== 2) return;
    if (accessibleProjects.length === 0 && units.length === 0) return;
    setUnitPickFilters((current) => {
      const next = ensureDefaultProjectOnFilters(
        current,
        units,
        accessibleProjects
      );
      if (next.projectId === current.projectId) return current;
      return next;
    });
  }, [step, units, accessibleProjects]);

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
    const fromForm = String(sellerForm.projectId || '').trim();
    if (fromForm) return fromForm;
    const fromFilters = String(unitPickFilters.projectId || '').trim();
    if (fromFilters) return fromFilters;
    const prefFilters = unitPickFiltersFromSellerPreferences(
      units,
      {
        interestedIn: sellerForm.interestedIn,
        preferredLocation: sellerForm.preferredLocation,
        preferredWing: sellerForm.preferredWing,
        budgetMin: sellerForm.budgetMin,
        budgetMax: sellerForm.budgetMax
      },
      accessibleProjects
    );
    const fromPrefs = String(prefFilters.projectId || '').trim();
    if (fromPrefs) return fromPrefs;
    const unitProjects = buildProjectFilterOptions(units);
    if (unitProjects.length === 1) return unitProjects[0][0];
    if (accessibleProjects.length === 1) return accessibleProjects[0].id;
    return '';
  }, [
    persistedInquiryProjectId,
    selectedUnit?.project_id,
    sellerForm.projectId,
    unitPickFilters.projectId,
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
      phoneCountry: sellerForm.phoneCountry,
      email: sellerForm.email,
      leadSource: sellerForm.leadSource,
      leadSourceOther: sellerForm.leadSourceOther,
      brokerId: sellerForm.brokerId
    }),
    [
      sellerForm.customerName,
      sellerForm.phone,
      sellerForm.phoneCountry,
      sellerForm.email,
      sellerForm.leadSource,
      sellerForm.leadSourceOther,
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

  const lookupExistingCustomers = useCallback(
    async (digits: string) => {
      if (phoneLookupAttemptedRef.current === digits) return;
      if (phoneLookupInFlightRef.current === digits) return;
      phoneLookupInFlightRef.current = digits;
      setExistingCustomerLookupLoading(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, phone_country')
          .or(`phone.eq.${digits},phone.ilike.%${digits}`)
          .order('full_name', { ascending: true })
          .limit(50);

        if (error) throw error;
        const matches = ((data ?? []) as ExistingCustomerMatch[]).filter(
          (row) => {
            const normalized = normalizePhone(row.phone ?? '');
            return (
              normalized === digits ||
              (normalized.length > 10 && normalized.endsWith(digits))
            );
          }
        );
        phoneLookupAttemptedRef.current = digits;
        if (matches.length > 0) {
          setExistingCustomerMatches(matches);
          setExistingCustomerPickerOpen(true);
        }
      } catch {
        phoneLookupAttemptedRef.current = '';
      } finally {
        if (phoneLookupInFlightRef.current === digits) {
          phoneLookupInFlightRef.current = '';
        }
        setExistingCustomerLookupLoading(false);
      }
    },
    [supabase]
  );

  const enquiryPhoneDigits = useMemo(
    () => normalizePhone(sellerForm.phone),
    [sellerForm.phone]
  );

  useEffect(() => {
    if (step !== 1 || stagesReadOnly) return;
    if (enquiryPhoneDigits.length < 10) {
      if (enquiryPhoneDigits.length === 0) {
        phoneLookupAttemptedRef.current = '';
      }
      return;
    }
    if (phoneLookupSuppressedRef.current) {
      phoneLookupAttemptedRef.current = enquiryPhoneDigits;
      phoneLookupSuppressedRef.current = false;
      return;
    }
    if (phoneLookupAttemptedRef.current === enquiryPhoneDigits) return;

    const timer = window.setTimeout(() => {
      void lookupExistingCustomers(enquiryPhoneDigits);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    enquiryPhoneDigits,
    step,
    stagesReadOnly,
    lookupExistingCustomers
  ]);

  const handleEnquiryPhoneChange = useCallback(
    (value: string) => {
      const digits = normalizePhone(value);
      const prevDigits = normalizePhone(sellerForm.phone);
      if (digits.length < 10) {
        phoneLookupAttemptedRef.current = '';
        setSelectedCustomerId('');
      } else if (digits !== prevDigits) {
        setSelectedCustomerId('');
        phoneLookupAttemptedRef.current = '';
      }
      setSellerForm((s) => ({ ...s, phone: value }));
    },
    [sellerForm.phone]
  );

  const handleSelectExistingCustomer = useCallback(
    (customer: ExistingCustomerMatch) => {
      setSelectedCustomerId(customer.id);
      setSellerForm((s) => ({
        ...s,
        customerName: String(customer.full_name || '').trim(),
        phoneCountry:
          String(customer.phone_country ?? '').trim() ||
          DEFAULT_COUNTRY_DIAL_CODE_OPTION,
        email: String(customer.email || '').trim()
      }));
      step1Validation.touch('customerName');
      step1Validation.touch('email');
      setExistingCustomerPickerOpen(false);
    },
    [step1Validation]
  );

  const stepValid = useMemo(() => {
    const step1Ok =
      inquiryWizardStep1Schema.safeParse(step1Values).success &&
      Boolean(userLabel.id);
    return {
      1: step1Ok,
      2:
        step1Ok &&
        inquiryWizardStep2Schema.safeParse({
          selectedUnitId: sellerForm.selectedUnitId
        }).success,
      3: Boolean(activeInquiryId)
    } as Record<StepId, boolean>;
  }, [step1Values, sellerForm.selectedUnitId, userLabel.id, activeInquiryId]);

  const persistCustomerToDb = useCallback(async (): Promise<string | null> => {
    if (!userLabel.id) {
      pageError('Sign in required to save customer details.');
      return null;
    }
    const digits = normalizePhone(sellerForm.phone);
    const fullName = String(sellerForm.customerName || '').trim();
    const email = String(sellerForm.email || '').trim() || null;
    const nameFields = namePartsFromFullName(fullName);

    try {
      if (selectedCustomerId) {
        const { data: selected, error: selErr } = await supabase
          .from('customers')
          .select('id')
          .eq('id', selectedCustomerId)
          .eq('phone_normalized', digits)
          .maybeSingle();
        if (!selErr && selected?.id) {
          const customerId = selected.id;
          const { error: upErr } = await supabase
            .from('customers')
            .update({
              ...nameFields,
              email,
              phone: digits,
              phone_country: sellerForm.phoneCountry
            })
            .eq('id', customerId);
          if (upErr) throw upErr;
          return customerId;
        }
      }

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
            ...nameFields,
            email,
            phone: digits,
            phone_country: sellerForm.phoneCountry
          })
          .eq('id', customerId);
        if (upErr) throw upErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('customers')
          .insert({
            ...nameFields,
            phone: digits,
            phone_country: sellerForm.phoneCountry,
            email
          })
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
    selectedCustomerId,
    sellerForm.customerName,
    sellerForm.phone,
    sellerForm.phoneCountry,
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

  async function saveCurrentStepForNavigation(): Promise<boolean> {
    if (step === 1) {
      const parsed = step1Validation.validate();
      if (!parsed.success) {
        pageError('Fix the highlighted fields before saving.');
        return false;
      }
      if (!stepValid[1]) return false;
      setSaving(true);
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return false;
        const filters = applySellerPrefsToUnitFilters();
        if (filters.projectId) {
          const saved = await saveEnquiryRecord(filters.projectId);
          if (!saved) return false;
        } else {
          markStepSaved(1);
        }
        return true;
      } finally {
        setSaving(false);
      }
    }
    if (step === 2) {
      return saveInquiryStep2({ advance: false });
    }
    if (step === 3) {
      const ok = await persistVisitSiteStage({
        site_visit: buildSiteVisitStagePayload()
      });
      if (ok) markStepSaved(3);
      return ok;
    }
    return true;
  }

  const tryLeaveCurrentStep = useCallback(
    (onProceed: () => void | Promise<void>): Promise<boolean> => {
      if (stagesReadOnly || !isCurrentStepUnsaved()) {
        return Promise.resolve(onProceed()).then(() => true);
      }
      return new Promise((resolve) => {
        openNavConfirm({ onProceed, resolve });
      });
    },
    [stagesReadOnly, isCurrentStepUnsaved, openNavConfirm]
  );

  function closeNavConfirm(proceeded: boolean) {
    const pending = takeNavPending();
    setNavConfirmOpen(false);
    pending?.resolve(proceeded);
  }

  async function handleNavSaveAndContinue() {
    setNavConfirmSaving(true);
    const saved = await saveCurrentStepForNavigation();
    if (!saved) {
      setNavConfirmSaving(false);
      return;
    }
    const pending = takeNavPending();
    setNavConfirmOpen(false);
    setNavConfirmSaving(false);
    if (!pending) return;
    await pending.onProceed();
    pending.resolve(true);
  }

  function handleNavDiscard() {
    const pending = takeNavPending();
    if (!pending) return;
    revertStepToSaved(step);
    setNavConfirmOpen(false);
    void Promise.resolve(pending.onProceed()).then(() => pending.resolve(true));
  }

  function handleNavCancel() {
    closeNavConfirm(false);
  }

  const performStepJump = useCallback(
    async (target: StepId) => {
      if (target > step) {
        for (let i = step; i < target; i++) {
          if (!stepValid[i as StepId]) {
            changeStep(i as StepId);
            return;
          }
        }
      }
      changeStep(target);
    },
    [step, stepValid, changeStep]
  );

  const runNavigationRequest = useCallback(
    async (request: WizardNavigationRequest) => {
      if (request.type === 'pipeline') {
        if (request.stage === 'Negotiation') {
          return tryLeaveCurrentStep(async () => {
            await onSkipToStage?.('Negotiation');
          });
        }
        const target = inquiryWizardStepForView(
          request.stage,
          funnelStageProp ?? 'Enquiry'
        );
        if (target === step) return true;
        return tryLeaveCurrentStep(() => performStepJump(target));
      }
      if (request.step === step) return true;
      return tryLeaveCurrentStep(() => performStepJump(request.step));
    },
    [step, funnelStageProp, onSkipToStage, tryLeaveCurrentStep, performStepJump]
  );

  useEffect(() => {
    if (!navigationRequest) return;
    const pending = takeNavigationRequest();
    if (!pending) return;
    void runNavigationRequest(pending.request).then(pending.resolve);
  }, [navigationRequest, takeNavigationRequest, runNavigationRequest]);

  useImperativeHandle(
    ref,
    () => ({
      hasUnsavedChanges: () => useInquiryWizardStore.getState().hasUnsavedChanges,
      tryGoToStep: (target: StepId) =>
        useInquiryWizardStore.getState().requestNavigation({ type: 'step', step: target }),
      tryGoToPipelineStage: (stage: InquiryPipelineUiStage) =>
        useInquiryWizardStore.getState().requestNavigation({
          type: 'pipeline',
          stage
        })
    }),
    []
  );

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
        const filters = applySellerPrefsToUnitFilters();
        if (filters.projectId) {
          const saved = await saveEnquiryRecord(filters.projectId);
          if (!saved) return;
        } else {
          markStepSaved(1);
        }
        changeStep(2);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 2) {
      const saved = await saveInquiryStep2();
      if (!saved) return;
      return;
    }
  }

  function goBack() {
    const target = Math.max(1, step - 1) as StepId;
    void tryLeaveCurrentStep(() => {
      changeStep(target);
    });
  }

  async function gotoStep(target: StepId) {
    if (target === step || saving) return;
    if (stagesReadOnly && target !== step) return;
    await tryLeaveCurrentStep(() => performStepJump(target));
  }

  function resetForm() {
    setSelectedCustomerId('');
    phoneLookupAttemptedRef.current = '';
    phoneLookupInFlightRef.current = '';
    phoneLookupSuppressedRef.current = false;
    setExistingCustomerMatches([]);
    setExistingCustomerPickerOpen(false);
    setSellerForm({
      customerName: '',
      phone: '',
      phoneCountry: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
      email: '',
      leadSource: 'Direct',
      leadSourceOther: '',
      brokerId: '',
      projectId: accessibleProjects.length === 1 ? accessibleProjects[0].id : '',
      interestedIn: '',
      preferredLocation: '',
      preferredWing: '',
      budgetMin: '',
      budgetMax: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      followUpDate: datetimeLocalValueNextWeek(),
      notes: ''
    });
    setCreatedInquiryId('');
    setPersistedInquiryProjectId('');
    setVisitInterest('');
    setNegotiationOffer('');
    setApprovalStatus('none');
    resetWizardState();
    changeStep(1);
    setUnitPickFilters(DEFAULT_UNIT_PICK_FILTERS);
  }

  async function addLeadSource(name: string): Promise<string | null> {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const existing = masterLeadSourceItems.find(
      (item) => item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) return existing.name;

    const nextSortOrder =
      masterLeadSourceItems.reduce(
        (highest, item) => Math.max(highest, item.sort_order),
        -1
      ) + 1;
    const { data, error } = await supabase
      .from('master_lookup_items')
      .insert({
        kind: 'lead_source',
        name: trimmedName,
        sort_order: nextSortOrder,
        is_active: true
      })
      .select('name')
      .single();

    if (error) {
      pageError(error.message);
      return null;
    }

    await reloadLeadSources();
    toast.success('Lead source added.');
    return data.name;
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
      cost_sheet_notes: sellerForm.notes.trim() || undefined,
      preferred_location: sellerForm.preferredLocation.trim() || undefined,
      preferred_wing: sellerForm.preferredWing.trim() || undefined,
      budget_min: sellerForm.budgetMin.trim() || undefined,
      budget_max: sellerForm.budgetMax.trim() || undefined,
      parking_required: sellerForm.parkingRequired,
      parking_count: sellerForm.parkingCount
    };
  }

  async function saveEnquiryRecord(projectIdOverride?: string): Promise<boolean> {
    if (!userLabel.id) {
      pageError('Sign in required to save enquiry.');
      return false;
    }
    const inquiryProjectId =
      String(projectIdOverride || '').trim() || resolveEnquiryProjectId();
    if (!inquiryProjectId) {
      pageError(
        accessibleProjects.length > 1
          ? 'Select a project on the Qualified step before continuing.'
          : 'Could not determine project. Select a project or pick a unit.'
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
      lead_source: persistedLeadSourceValue(
        sellerForm.leadSource,
        sellerForm.leadSourceOther
      ),
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
      markStepSaved(1);
      onStageDataSaved?.();
      if (!activeInquiryId) await onCreated?.(inquiryId);
      await onInquirySaved?.();
      return true;
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save enquiry');
      return false;
    }
  }

  async function saveInquiryStep2(options?: {
    advance?: boolean;
  }): Promise<boolean> {
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return false;
    }
    if (!userLabel.id) return false;

    const advance = options?.advance !== false;

    const unitId = String(sellerForm.selectedUnitId || '').trim();
    if (!unitId) {
      step2Validation.touch('selectedUnitId');
      pageError('Select an available unit before qualifying this enquiry.');
      return false;
    }
    const inquiryProjectId =
      String(selectedUnit?.project_id || '').trim() || resolveEnquiryProjectId();
    if (!inquiryProjectId) {
      pageError(
        accessibleProjects.length > 1
          ? 'Select a project from the dropdown before continuing.'
          : 'Could not determine project. Select a project or pick a unit.'
      );
      return false;
    }

    if (
      unitId &&
      (!selectedUnit ||
        !isUnitSelectableForQualifyPick(selectedUnit, inquiryHeldUnitId))
    ) {
      pageError(
        'Selected unit is not available — it may be held by another enquiry.'
      );
      return false;
    }

    setSaving(true);
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return false;

      const brokerId =
        sellerForm.leadSource === 'Broker' &&
          String(sellerForm.brokerId || '').trim()
          ? sellerForm.brokerId.trim()
          : null;

      const rowFields = {
        project_id: inquiryProjectId,
        customer_id: customerId,
        unit_id: unitId || null,
        lead_source: persistedLeadSourceValue(
        sellerForm.leadSource,
        sellerForm.leadSourceOther
      ),
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
        const saved = await saveEnquiryRecord(inquiryProjectId);
        if (!saved) return false;
        inquiryId = String(createdInquiryId || activeInquiryId || '').trim();
        if (!inquiryId) return false;
        if (unitId) {
          const { error: linkErr } = await supabase
            .from('sales_inquiries')
            .update({ unit_id: unitId })
            .eq('id', inquiryId);
          if (linkErr) throw linkErr;
        }
      }

      const enquiryPayload = buildEnquiryStagePayload();

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
      if (advance) changeStep(3);
      markStepSaved(2);
      onFunnelStageChange?.('Qualified');
      toast.success('Unit qualified — record the site visit when ready.');
      onStageDataSaved?.();
      await onInquirySaved?.();
      return true;
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save inquiry');
      return false;
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
    markStepSaved(3);
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
    visitValidation.touch('visitInterest');
    if (next === 'Not Interested') {
      if (inquiryClosed && closedStatus === 'Not Interested') return;
      if (inquiryClosed || stagesReadOnly || saving) return;
      setNotInterestedConfirmOpen(true);
      return;
    }
    setVisitInterest(next);
    if (next === 'Interested') {
      if (inquiryClosed) return;
      if (activeInquiryId && !inquiryClosed && !stagesReadOnly) {
        await persistVisitSiteStage({
          site_visit: buildSiteVisitStagePayload({ outcome: 'Interested' })
        });
      }
    }
  }

  async function confirmCloseAsNotInterested() {
    setNotInterestedConfirmOpen(false);
    setVisitInterest('Not Interested');
    await handleCloseAsNotInterested('Not Interested');
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

  async function handleSkipToNegotiation() {
    if (saving) return;
    if (stagesReadOnly) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await onSkipToStage?.('Negotiation');
    } finally {
      setSaving(false);
    }
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
          className="mb-4 rounded-md border border-ds-warning-200 bg-ds-warning-50 px-3 py-2 text-xs text-ds-warning-900"
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
          leadSourceOptions={leadSourceOptions}
          onAddLeadSource={addLeadSource}
          unitTypeOptions={unitTypeOptions}
          signedIn={Boolean(userLabel.id)}
          fieldError={step1Validation.fieldError}
          touch={step1Validation.touch}
          readOnly={stagesReadOnly}
          onPhoneChange={handleEnquiryPhoneChange}
          customerLookupLoading={existingCustomerLookupLoading}
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
            Pick an available unit from the inventory grid to qualify this lead.
            All units are shown with price and status; only available inventory
            can be selected. Saving the selection qualifies the lead and blocks
            the unit for this enquiry.
          </p>
          <InquiryUnitPicker
            projects={accessibleProjects}
            units={units}
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
            costSheetSend={{
              inquiryId: activeInquiryId,
              unitId: sellerForm.selectedUnitId,
              customerName: sellerForm.customerName,
              customerEmail: sellerForm.email,
              customerPhone: sellerForm.phone,
              disabled: stagesReadOnly || !activeInquiryId,
              disabledReason: !activeInquiryId
                ? 'Save enquiry details first to send the cost sheet.'
                : stagesReadOnly
                  ? INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE
                  : undefined
            }}
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
          notInterestedConfirmOpen={notInterestedConfirmOpen}
          onNotInterestedConfirmOpenChange={setNotInterestedConfirmOpen}
          onConfirmCloseNotInterested={() => void confirmCloseAsNotInterested()}
          onFollowUpBlur={() => {
            if (!activeInquiryId || stagesReadOnly) return;
            if (inquiryClosed) return;
            void persistVisitSiteStage({
              site_visit: buildSiteVisitStagePayload()
            });
          }}
          onSkipToNegotiation={() => void handleSkipToNegotiation()}
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
          {isCurrentStepUnsaved() && !stagesReadOnly ? (
            <span className="text-xs font-medium text-ds-warning-800">
              Unsaved changes
            </span>
          ) : null}
          {!userLabel.id ? (
            <span className="text-xs text-ds-warning-700">Sign in required.</span>
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
                    ? 'Save unit & continue'
                    : 'Next'}
            </Button>
          ) : null}
        </div>
      </div>

      <ExistingCustomerPickerDialog
        open={existingCustomerPickerOpen}
        onOpenChange={setExistingCustomerPickerOpen}
        matches={existingCustomerMatches}
        phone={sellerForm.phone}
        onSelect={handleSelectExistingCustomer}
      />

      <Dialog open={navConfirmOpen} onOpenChange={(open) => !open && handleNavCancel()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Save before leaving, or discard your
              edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleNavCancel}
              disabled={navConfirmSaving}
            >
              Stay on step
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleNavDiscard}
              disabled={navConfirmSaving}
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={() => void handleNavSaveAndContinue()}
              disabled={navConfirmSaving}
            >
              {navConfirmSaving ? 'Saving…' : 'Save & continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

// ─── Types ───────────────────────────────────────────────────────────────────

type SellerForm = {
  customerName: string;
  phone: string;
  phoneCountry: string;
  email: string;
  leadSource: string;
  leadSourceOther: string;
  brokerId: string;
  projectId: string;
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

function ExistingCustomerPickerDialog({
  open,
  onOpenChange,
  matches,
  phone,
  onSelect
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: ExistingCustomerMatch[];
  phone: string;
  onSelect: (customer: ExistingCustomerMatch) => void;
}) {
  const digits = normalizePhone(phone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-ds-gray-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ds-gray-900">
            Existing customer found
          </DialogTitle>
          <DialogDescription className="text-left text-ds-gray-600">
            Mobile <span className="font-medium text-ds-gray-800">{digits}</span>{' '}
            matches {matches.length === 1 ? 'an existing' : `${matches.length} existing`}{' '}
            customer{matches.length === 1 ? '' : 's'}. Select one to fill name and
            email, or close to enter new details.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto pr-1">
          {matches.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="w-full rounded-lg border border-ds-gray-200 bg-card px-3 py-3 text-left transition-colors hover:border-ds-primary-300 hover:bg-ds-primary-50"
              onClick={() => onSelect(customer)}
            >
              <p className="text-sm font-medium text-ds-gray-900">
                {String(customer.full_name || '').trim() || 'Unnamed customer'}
              </p>
              <p className="mt-0.5 text-xs text-ds-gray-500">
                {String(customer.email || '').trim() || 'No email on file'}
              </p>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Enter new details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 1: Enquiry (customer + unit preferences) ───────────────────────────

function StepEnquiry({
  sellerForm,
  setSellerForm,
  brokers,
  leadSourceOptions,
  onAddLeadSource,
  unitTypeOptions,
  signedIn,
  fieldError,
  touch,
  readOnly,
  onPhoneChange,
  customerLookupLoading
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  brokers: { id: string; full_name: string }[];
  leadSourceOptions: string[];
  onAddLeadSource: (name: string) => Promise<string | null>;
  unitTypeOptions: string[];
  signedIn: boolean;
  fieldError: (field: keyof InquiryWizardStep1Values) => string | undefined;
  touch: (field: keyof InquiryWizardStep1Values) => void;
  readOnly?: boolean;
  onPhoneChange?: (value: string) => void;
  customerLookupLoading?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-5 space-y-4',
        readOnly && 'pointer-events-none opacity-60'
      )}
    >
      {!signedIn ? (
        <p className="rounded-md border border-ds-warning-200 bg-ds-warning-50 px-3 py-2 text-xs text-ds-warning-900">
          Sign in to save and continue.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
          <PhoneInputField
            value={sellerForm.phone}
            onChange={(v) => {
              if (onPhoneChange) {
                onPhoneChange(v);
              } else {
                setSellerForm((s) => ({ ...s, phone: v }));
              }
              touch('phone');
            }}
            countryCode={sellerForm.phoneCountry}
            onCountryCodeChange={(next) => {
              setSellerForm((s) => ({ ...s, phoneCountry: next }));
              touch('phone');
            }}
            label="Phone"
            required
            mode="digits10"
            inputClassName={wizardInputClass}
            labelClassName={wizardLabelClass}
            error={fieldError('phone')}
          />
          {customerLookupLoading ? (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ds-gray-500">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Checking for existing customer…
            </p>
          ) : null}
        </div>
        <TextInputField
          label="Customer name"
          labelClassName={wizardLabelClass}
          inputClassName={wizardFieldClass}
          value={sellerForm.customerName}
          onChange={(e) => {
            setSellerForm((s) => ({ ...s, customerName: e.target.value }));
            touch('customerName');
          }}
          onBlur={() => touch('customerName')}
          required
          error={fieldError('customerName')}
          placeholder="Full name"
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

      <div
        className={cn(
          'grid grid-cols-1 gap-3',
          sellerForm.leadSource === 'Broker' && 'sm:grid-cols-2'
        )}
      >
        <div>
          <FieldLabel className={wizardLabelClass} required>
            Lead source
          </FieldLabel>
          <SearchableSelect
            value={sellerForm.leadSource}
            onValueChange={(v) => {
              setSellerForm((s) => ({
                ...s,
                leadSource: v,
                leadSourceOther: v === 'Other' ? s.leadSourceOther : '',
                brokerId: v === 'Broker' ? s.brokerId : ''
              }));
              touch('leadSource');
            }}
            options={leadSourceOptions}
            onCreateOption={onAddLeadSource}
            placeholder="Select source…"
            searchPlaceholder="Search or add a lead source…"
            className={wizardSelectTriggerClass}
            error={Boolean(fieldError('leadSource'))}
          />
          <FormFieldError message={fieldError('leadSource')} />
        </div>

        {sellerForm.leadSource === 'Other' ? (
          <div>
            <FieldLabel className={wizardLabelClass} required>
              Other source
            </FieldLabel>
            <Input
              className={wizardInputClass}
              value={sellerForm.leadSourceOther}
              onChange={(e) => {
                setSellerForm((s) => ({ ...s, leadSourceOther: e.target.value }));
                touch('leadSourceOther');
              }}
              placeholder="Describe lead source…"
              aria-invalid={fieldError('leadSourceOther') ? true : undefined}
            />
            <FormFieldError message={fieldError('leadSourceOther')} />
          </div>
        ) : null}

        {sellerForm.leadSource === 'Broker' ? (
          <div>
            <FieldLabel className={wizardLabelClass} required>
              Broker
            </FieldLabel>
            <SearchableSelect
              value={
                brokers.find((b) => b.id === sellerForm.brokerId)?.full_name ??
                ''
              }
              onValueChange={(name) => {
                const broker = brokers.find((b) => b.full_name === name);
                setSellerForm((s) => ({ ...s, brokerId: broker?.id ?? '' }));
                touch('brokerId');
              }}
              options={brokers.map((b) => b.full_name)}
              placeholder="Select broker…"
              searchPlaceholder="Search broker…"
              className={wizardSelectTriggerClass}
            />
            {brokers.length === 0 ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No active brokers — add one under CRM → Brokers.
              </p>
            ) : null}
            <FormFieldError message={fieldError('brokerId')} />
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-ds-gray-200 bg-card p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">
          What are they looking for?
        </p>
        <p className="mt-0.5 text-[11px] text-ds-gray-500">
          Unit type, budget, location, and parking — before you pick a unit on
          the next step.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className={wizardLabelClass}>Unit type / layout</Label>
            <SearchableSelect
              value={sellerForm.interestedIn}
              onValueChange={(v) =>
                setSellerForm((s) => ({ ...s, interestedIn: v }))
              }
              options={unitTypeOptions}
              placeholder="Select unit type…"
              searchPlaceholder="Search unit type…"
              className={wizardSelectTriggerClass}
            />
            {unitTypeOptions.length === 0 ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No unit types in catalog — add types under project settings.
              </p>
            ) : null}
          </div>
          <TextInputField
            label="Preferred area / locality"
            labelClassName={wizardLabelClass}
            inputClassName={wizardFieldClass}
            placeholder="Optional — neighbourhood or landmark"
            value={sellerForm.preferredLocation}
            onChange={(e) =>
              setSellerForm((s) => ({
                ...s,
                preferredLocation: e.target.value
              }))
            }
          />
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
          <TextInputField
            label="Preferred wing / tower"
            labelClassName={wizardLabelClass}
            inputClassName={wizardFieldClass}
            value={sellerForm.preferredWing}
            onChange={(e) =>
              setSellerForm((s) => ({ ...s, preferredWing: e.target.value }))
            }
          />
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
        <TextareaField
          label="Other requirements"
          labelClassName={wizardLabelClass}
          textareaClassName={wizardTextareaClass}
          value={sellerForm.notes}
          onChange={(e) =>
            setSellerForm((s) => ({ ...s, notes: e.target.value }))
          }
          rows={3}
        />
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
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'min-h-9 flex-1 px-3 py-2 text-sm font-medium transition-colors',
            disabled && 'cursor-not-allowed',
            value === opt.value
              ? disabled
                ? 'bg-ds-primary-400 text-white'
                : 'bg-primary text-primary-foreground'
              : disabled
                ? 'bg-ds-gray-50 text-ds-gray-400'
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
  notInterestedConfirmOpen,
  onNotInterestedConfirmOpenChange,
  onConfirmCloseNotInterested,
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
  notInterestedConfirmOpen?: boolean;
  onNotInterestedConfirmOpenChange?: (open: boolean) => void;
  onConfirmCloseNotInterested?: () => void;
  followUpAssignedToMe?: boolean;
  onFollowUpBlur?: () => void;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  inquiryClosed: boolean;
  closedStatus: string | null;
  tokenBlockedByApproval: boolean;
  saving: boolean;
  stagesReadOnly?: boolean;
  onSkipToNegotiation?: () => void | Promise<void>;
  onCreateBooking?: () => void;
}) {
  const formDisabled = inquiryClosed || stagesReadOnly;
  if (!selectedUnit) {
    return (
      <div className="mt-5 rounded-lg border border-ds-warning-200 bg-ds-warning-50 px-3 py-3 text-xs text-ds-warning-900">
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

      <div className="rounded-xl border border-ds-gray-200 bg-card p-4 shadow-sm">
        <p className="text-xs font-semibold text-ds-gray-800">Site visit</p>
        <p className="mt-0.5 text-[11px] text-ds-gray-500">
          Set a follow-up date for the assigned team member. Choosing{' '}
          <span className="font-medium">Not interested</span> closes the enquiry
          (Closed stage) and releases the unit.
        </p>
        <div className="mt-3 grid gap-3">
          <DateTimeInputField
            label="Follow-up date"
            labelClassName={wizardLabelClass}
            buttonClassName={cn(
              wizardFieldClass,
              followUpAssignedToMe &&
                followUpNeedsAttention(sellerForm.followUpDate) &&
                'border-ds-primary-400 ring-1 ring-ds-primary-200'
            )}
            value={sellerForm.followUpDate}
            onChange={(followUpDate) =>
              setSellerForm((s) => ({ ...s, followUpDate }))
            }
            onBlur={() => onFollowUpBlur?.()}
            disabled={formDisabled}
            placeholder="Pick follow-up date & time"
          />
            {followUpAssignedToMe ? (
              <p className="text-[11px] text-ds-primary-700">
                Shown on your Work queue follow-ups when due.
              </p>
            ) : null}
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
            <p className="text-[11px] text-ds-warning-900">
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
              onClick={() => void onSkipToNegotiation?.()}
            >
              {saving ? 'Opening…' : 'Negotiation'}
            </Button>
            <Button
              type="button"
              className="flex-1 gap-1 bg-primary hover:bg-primary/90"
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

      <Dialog
        open={notInterestedConfirmOpen}
        onOpenChange={onNotInterestedConfirmOpenChange}
      >
        <DialogContent className="max-w-md border-ds-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ds-gray-900">
              Close enquiry as not interested?
            </DialogTitle>
            <DialogDescription className="text-left text-ds-gray-600">
              This moves the enquiry to{' '}
              <span className="font-medium text-ds-gray-800">Closed</span> and
              releases{' '}
              <span className="font-medium text-ds-gray-800">
                {selectedUnit.unit_code}
              </span>{' '}
              back to available inventory. This cannot be undone from this
              screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={saving}
              onClick={() => onNotInterestedConfirmOpenChange?.(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full sm:w-auto"
              disabled={saving}
              onClick={() => onConfirmCloseNotInterested?.()}
            >
              {saving ? 'Closing…' : 'Close enquiry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectedUnitSummaryCard({ unit }: { unit: UnitRow }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ds-primary-200 bg-card shadow-sm">
      <div className="border-b border-ds-primary-100 bg-linear-to-br from-ds-primary-50 to-background px-4 py-4">
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
