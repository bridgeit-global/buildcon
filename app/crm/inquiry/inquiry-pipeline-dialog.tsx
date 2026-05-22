'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pageError } from '@/lib/toast';
import { negotiationApprovalRequestSchema } from '@/lib/inquiry/inquiry-pipeline.schema';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  applyUnitStatusForFunnelStage,
  closeInquiry,
  computeNegotiationDiscount,
  getNegotiationApprovalStatus,
  isInquiryClosed,
  negotiationApprovalBlockMessage,
  tokenStageBlockedByNegotiation,
  SITE_VISIT_OUTCOMES
} from './inquiry-stage-transitions';
import { navigateToCreateBookingFromInquiry } from './booking-prefill-from-inquiry';
import {
  fetchActiveBookingForInquiry,
  INQUIRY_ACTIVE_BOOKING_MESSAGE,
  INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE,
  inquiryNegotiationStageLocked,
  inquiryStagesLockedByUnitToken
} from './inquiry-booking-guard';
import {
  INQUIRY_PIPELINE_UI_STAGES,
  pipelineUiStage,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';
import {
  formatInr,
  formatInrCompactLacCr,
  unitAgreementTotalInr,
  type UnitPricingInput
} from '../inr-format';
import { statusLabelForUnit } from '../inventory/inventory-utils';
import type { InquiryStageData } from './inquiry-types';
import {
  enrichNegotiationFromApprovals,
  loadInquiryStageData,
  persistNegotiationApprovalRequest,
  saveInquiryStageData
} from './inquiry-stage-store';
import type { InquiryFunnelStage } from './inquiry-funnel-stages';

export { INQUIRY_PIPELINE_UI_STAGES as FUNNEL_STAGES } from './inquiry-funnel-stages';

// ─── Stage definitions ────────────────────────────────────────────────────────

type FunnelStage = InquiryPipelineUiStage;

/** Pipeline UI stages; payloads stored in `sales_inquiries.stage_data`. */
const PIPELINE_ANCHOR_STAGES = INQUIRY_PIPELINE_UI_STAGES;
type PipelineAnchorStage = (typeof PIPELINE_ANCHOR_STAGES)[number];

const PIPELINE_STEPS: {
  id: PipelineAnchorStage;
  label: string;
  step: number;
  summary: string;
}[] = [
  {
    id: 'Enquiry',
    label: 'Enquiry',
    step: 1,
    summary:
      'Initial enquiry: customer details, unit interest, budget, and cost sheet notes captured at creation.'
  },
  {
    id: 'Qualified',
    label: 'Qualified',
    step: 2,
    summary:
      'Lead is qualified — unit is blocked in inventory. Confirm budget, financing, and follow-up.'
  },
  {
    id: 'Site Visit',
    label: 'Site Visit',
    step: 3,
    summary:
      'Schedule site visit and follow-ups. After the visit, record Liked or Disliked to advance or close.'
  },
  {
    id: 'Negotiation',
    label: 'Negotiate',
    step: 4,
    summary:
      'Track price discussion, discounts or counter-offers, and what was agreed verbally. When ready to commit, create a booking (token is recorded there).'
  }
];

function stageIndex(s: string) {
  return PIPELINE_STEPS.findIndex((p) => p.id === s);
}

type PipelineMacroStep = 'customer' | 'unit' | 'enquiry';

const MACRO_STEPS: { id: PipelineMacroStep; label: string }[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'unit', label: 'Unit' },
  { id: 'enquiry', label: 'Enquiry' }
];

function macroStepIndex(m: PipelineMacroStep) {
  return MACRO_STEPS.findIndex((s) => s.id === m);
}

// ─── In-memory stage form shape (persisted in `sales_inquiries.stage_data`) ───

type EnquiryStageData = {
  follow_up_date?: string;
  /** Quotation id, sheet version, or free-text reference to the shared cost sheet. */
  cost_sheet_notes?: string;
  notes?: string;
};
type QualifiedStageData = {
  budget_min?: string;
  budget_max?: string;
  financing?: string;
  temperature?: string;
  follow_up_date?: string;
  notes?: string;
};
type SiteVisitStageData = {
  scheduled_at?: string;
  status?: string;
  outcome?: string;
  notes?: string;
};
type NegotiationStageData = {
  offered_price?: string;
  discount_pct?: string;
  counter_offer?: string;
  expected_close?: string;
  notes?: string;
  approval_status?: string;
  approval_id?: string;
  decision_note?: string;
};
type TokenStageData = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
  recorded_at?: string;
};
type StageData = {
  enquiry?: EnquiryStageData;
  qualified?: QualifiedStageData;
  site_visit?: SiteVisitStageData;
  negotiation?: NegotiationStageData;
  token?: TokenStageData;
};

// ─── Inquiry pipeline row ─────────────────────────────────────────────────────

export type InquiryPipelineRow = {
  id: string;
  funnel_stage: string;
  assigned_to: string | null;
  stage_data: InquiryStageData | Record<string, unknown> | null;
};

/** @deprecated Use InquiryPipelineRow */
export type OpportunityRow = InquiryPipelineRow;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyStageData(): StageData {
  return {
    enquiry: {},
    qualified: {},
    site_visit: {},
    negotiation: {},
    token: {}
  };
}

function mergeStageDataFromJson(
  raw: InquiryStageData | Record<string, unknown> | null | undefined
): StageData {
  const base = emptyStageData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as InquiryStageData;
  return {
    enquiry: { ...base.enquiry, ...(r.enquiry as EnquiryStageData) },
    qualified: { ...base.qualified, ...(r.qualified as QualifiedStageData) },
    site_visit: { ...base.site_visit, ...(r.site_visit as SiteVisitStageData) },
    negotiation: {
      ...base.negotiation,
      ...(r.negotiation as NegotiationStageData)
    },
    token: { ...base.token, ...(r.token as TokenStageData) }
  };
}

function stageDataToJson(data: StageData): InquiryStageData {
  return {
    enquiry: data.enquiry ?? {},
    qualified: data.qualified ?? {},
    site_visit: data.site_visit ?? {},
    negotiation: data.negotiation ?? {},
    token: data.token ?? {}
  };
}

// ─── Shared toggle helper ─────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  disabled
}: {
  options: { value: T; label: string }[];
  value: T | undefined | '';
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-md border border-border',
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
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

// ─── Pipeline progress: macro (Customer → Unit → Enquiry) + vertical funnel ─

function MacroPipelineStepper({
  current,
  onSelect
}: {
  current: PipelineMacroStep;
  onSelect: (step: PipelineMacroStep) => void;
}) {
  const currentIdx = macroStepIndex(current);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative flex min-w-max items-start justify-between gap-0 px-1">
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          style={{ zIndex: 0 }}
          aria-hidden
        />
        {MACRO_STEPS.map((step, idx) => {
          const isActive = step.id === current;
          const isDone = idx < currentIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelect(step.id)}
              className="relative z-10 flex min-h-[44px] min-w-0 flex-1 flex-col items-center gap-1 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  isActive
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : isDone
                      ? 'border-teal-500 bg-white text-teal-600'
                      : 'border-border bg-white text-muted-foreground'
                )}
              >
                {isDone ? '✓' : idx + 1}
              </span>
              <span
                className={cn(
                  'max-w-22 text-center text-[10px] font-semibold leading-tight sm:max-w-none',
                  isActive
                    ? 'text-teal-700'
                    : isDone
                      ? 'text-teal-600'
                      : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VerticalEnquiryStageStepper({
  current,
  onSelect,
  canSelectStage
}: {
  current: string;
  onSelect: (stage: PipelineAnchorStage) => void;
  canSelectStage?: (stage: PipelineAnchorStage) => boolean;
}) {
  const currentIdx = stageIndex(current);
  return (
    <nav
      className="shrink-0 rounded-lg border border-border bg-muted/20 p-2 sm:p-3 md:w-44"
      aria-label="Enquiry pipeline stages"
    >
      <ol className="flex flex-col">
        {PIPELINE_STEPS.map((step, idx) => {
          const isActive = step.id === current;
          const isDone = idx < currentIdx;
          const isLast = idx === PIPELINE_STEPS.length - 1;
          const selectable = canSelectStage ? canSelectStage(step.id) : true;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => {
                  if (!selectable) return;
                  onSelect(step.id);
                }}
                className={cn(
                  'flex w-full min-h-[44px] gap-2 rounded-md px-1 py-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3',
                  selectable
                    ? 'hover:bg-muted/60'
                    : 'cursor-not-allowed opacity-50'
                )}
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={!selectable}
              >
                <div className="flex shrink-0 flex-col items-center">
                  <div className="flex h-9 items-center justify-center">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                        isActive
                          ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                          : isDone
                            ? 'border-teal-500 bg-background text-teal-600'
                            : 'border-border bg-background text-muted-foreground'
                      )}
                    >
                      {isDone ? '✓' : step.step}
                    </span>
                  </div>
                  {!isLast ? (
                    <div
                      className="w-0.5 shrink-0 bg-border"
                      style={{ height: '10px' }}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <span
                  className={cn(
                    'flex flex-1 items-center text-xs font-semibold leading-snug',
                    isActive
                      ? 'text-teal-700'
                      : isDone
                        ? 'text-teal-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ActiveStageGuide({ stage }: { stage: string }) {
  const meta = PIPELINE_STEPS.find((p) => p.id === stage);
  if (!meta) return null;
  return (
    <div
      className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 sm:px-4"
      role="region"
      aria-label={`About the ${meta.label} stage`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        What this stage is for
      </p>
      <p className="mt-1 text-sm leading-snug text-foreground">{meta.summary}</p>
    </div>
  );
}

// ─── Stage form panels ────────────────────────────────────────────────────────

function EnquiryForm({
  data,
  onChange,
  readOnly
}: {
  data: EnquiryStageData;
  onChange: (d: EnquiryStageData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Follow-up date</Label>
        <Input
          type="datetime-local"
          className="h-8 text-xs"
          value={data.follow_up_date ?? ''}
          onChange={(e) => onChange({ ...data, follow_up_date: e.target.value })}
          disabled={readOnly}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Cost sheet / quotation notes</Label>
        <Textarea
          className="min-h-[56px] resize-y text-xs"
          placeholder="Quotation number, rate card version, or what was shared with the buyer…"
          value={data.cost_sheet_notes ?? ''}
          onChange={(e) =>
            onChange({ ...data, cost_sheet_notes: e.target.value })
          }
          disabled={readOnly}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Initial enquiry notes…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

function QualifiedForm({
  data,
  onChange,
  readOnly
}: {
  data: QualifiedStageData;
  onChange: (d: QualifiedStageData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Budget min (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="50,00,000"
            value={data.budget_min ?? ''}
            onChange={(e) => onChange({ ...data, budget_min: e.target.value })}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Budget max (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="80,00,000"
            value={data.budget_max ?? ''}
            onChange={(e) => onChange({ ...data, budget_max: e.target.value })}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Financing</Label>
        <ToggleGroup
          options={[
            { value: 'Self-funded', label: 'Self-funded' },
            { value: 'Bank Loan', label: 'Bank loan' },
            { value: 'Mix', label: 'Mix' }
          ]}
          value={data.financing ?? ''}
          onChange={(v) => onChange({ ...data, financing: v })}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Temperature</Label>
        <ToggleGroup
          options={[
            { value: 'Hot', label: '🔥 Hot' },
            { value: 'Warm', label: '🌤 Warm' },
            { value: 'Cold', label: '❄️ Cold' }
          ]}
          value={data.temperature ?? ''}
          onChange={(v) => onChange({ ...data, temperature: v })}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Next follow-up</Label>
        <Input
          type="datetime-local"
          className="h-8 text-xs"
          value={data.follow_up_date ?? ''}
          onChange={(e) =>
            onChange({ ...data, follow_up_date: e.target.value })
          }
          disabled={readOnly}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Requirements, concerns, pre-approval status…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

function InquiryBookingLockedBanner({
  bookingId
}: {
  bookingId: string;
}) {
  return (
    <div
      role="status"
      className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-950"
    >
      <p>{INQUIRY_ACTIVE_BOOKING_MESSAGE}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 min-h-9 border-teal-300 text-teal-800"
        asChild
      >
        <Link href={`/crm/bookings/${bookingId}`}>Open booking</Link>
      </Button>
    </div>
  );
}

function InquiryUnitTokenLockedBanner() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
    >
      <p>{INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE}</p>
    </div>
  );
}

function SiteVisitForm({
  data,
  onChange,
  onAdvance,
  onCreateBooking,
  onCloseEnquiry,
  saving,
  pipelineClosed,
  inquiryBookingLocked,
  stagesReadOnly
}: {
  data: SiteVisitStageData;
  onChange: (d: SiteVisitStageData) => void;
  onAdvance: (stage: PipelineAnchorStage) => void;
  onCreateBooking: () => void;
  onCloseEnquiry: () => void;
  saving: boolean;
  pipelineClosed: boolean;
  inquiryBookingLocked?: boolean;
  stagesReadOnly?: boolean;
}) {
  const formDisabled = pipelineClosed || stagesReadOnly;
  const outcome = String(data.outcome || '').trim();
  const visitDone = data.status === 'Done';
  const showLikedActions =
    visitDone && outcome === 'Liked' && !formDisabled;
  const showDislikedAction =
    visitDone && outcome === 'Disliked' && !formDisabled;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Visit date &amp; time</Label>
        <Input
          type="datetime-local"
          className="h-8 text-xs"
          value={data.scheduled_at ?? ''}
          onChange={(e) =>
            onChange({ ...data, scheduled_at: e.target.value })
          }
          disabled={formDisabled}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Visit status</Label>
        <Select
          value={data.status ?? ''}
          onValueChange={(v) => onChange({ ...data, status: v })}
          disabled={formDisabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
            <SelectItem value="No-show">No-show</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="Rescheduled">Rescheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Outcome</Label>
        <ToggleGroup
          options={SITE_VISIT_OUTCOMES.map((value) => ({
            value,
            label:
              value === 'Liked'
                ? 'Liked'
                : value === 'Disliked'
                  ? 'Disliked'
                  : value === 'Need Another Visit'
                    ? 'Another visit'
                    : 'Undecided'
          }))}
          value={data.outcome ?? ''}
          onChange={(v) => onChange({ ...data, outcome: v })}
          disabled={formDisabled}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Notes / feedback</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Site visit feedback, highlights shown…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          disabled={formDisabled}
        />
      </div>

      {showLikedActions ? (
        <div
          className="rounded-lg border border-ds-primary-200 bg-ds-primary-50/50 p-3"
          role="region"
          aria-label="Next step after site visit"
        >
          <p className="text-xs font-semibold text-ds-gray-800">Buyer liked the unit — choose next step</p>
          <p className="mt-1 text-[11px] text-ds-gray-600">Start negotiation if price discussion is needed, or create a booking when they are ready to commit.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11 flex-1 border-ds-primary-300 text-ds-primary-700" disabled={saving || inquiryBookingLocked} onClick={() => onAdvance('Negotiation')}>Negotiation</Button>
            <Button type="button" className="min-h-11 flex-1 gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving || inquiryBookingLocked} onClick={onCreateBooking}>
              Create booking
              <ArrowRight className="size-3.5 opacity-90" />
            </Button>
          </div>
        </div>
      ) : null}

      {showDislikedAction ? (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3" role="region" aria-label="Close enquiry">
          <p className="text-xs font-semibold text-ds-gray-800">Buyer did not like the unit</p>
          <p className="mt-1 text-[11px] text-ds-gray-600">Close this enquiry and release the unit back to available inventory.</p>
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full border-red-300 text-red-700 hover:bg-red-50 sm:w-auto" disabled={saving} onClick={onCloseEnquiry}>Close enquiry</Button>
        </div>
      ) : null}

    </div>
  );
}

function NegotiationForm({
  data,
  onChange,
  inquiryId,
  projectId,
  unitId,
  listPriceInr,
  supabase,
  onApprovalSubmitted,
  onApprovedCreateBooking,
  onRejectedClose,
  inquiryBookingLocked,
  stagesReadOnly
}: {
  data: NegotiationStageData;
  onChange: (d: NegotiationStageData) => void;
  inquiryId?: string;
  projectId?: string | null;
  unitId?: string | null;
  listPriceInr?: number | null;
  supabase?: ReturnType<typeof createSupabaseBrowserClient>;
  onApprovalSubmitted?: () => void;
  onApprovedCreateBooking?: () => void | Promise<void>;
  onRejectedClose?: (decisionNote?: string) => void | Promise<void>;
  inquiryBookingLocked?: boolean;
  stagesReadOnly?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const approvalValidation = useFieldValidation(negotiationApprovalRequestSchema, {
    offeredPrice: data.offered_price ?? '',
    requestNote: data.notes ?? ''
  });
  const approvalStatus = getNegotiationApprovalStatus(data);
  const listPrice =
    listPriceInr != null && listPriceInr > 0 ? listPriceInr : null;
  const { discountPct, discountInr } = computeNegotiationDiscount(
    listPrice,
    data.offered_price
  );

  function applyOfferedPrice(offeredRaw: string) {
    const { discountPct: pct } = computeNegotiationDiscount(listPrice, offeredRaw);
    onChange({
      ...data,
      offered_price: offeredRaw,
      discount_pct: pct != null ? String(pct) : ''
    });
  }

  async function refreshApprovalStatus() {
    if (!supabase || !inquiryId) return;
    setRefreshing(true);
        try {
      const { data: loaded } = await loadInquiryStageData(supabase, inquiryId);
      const enriched = await enrichNegotiationFromApprovals(
        supabase,
        inquiryId,
        loaded
      );
      const neg = enriched.negotiation ?? {};
      const next = { ...data, ...(neg as NegotiationStageData) };
      const prevStatus = String(data.approval_status ?? '').toLowerCase();
      const nextStatus = String(next.approval_status ?? '').toLowerCase();
      onChange(next);

      if (nextStatus === 'rejected') {
        await onRejectedClose?.(String(next.decision_note ?? ''));
        onApprovalSubmitted?.();
        return;
      }

      if (nextStatus === 'approved' && prevStatus !== 'approved') {
        await onApprovedCreateBooking?.();
        onApprovalSubmitted?.();
        return;
      }

      onApprovalSubmitted?.();
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Could not refresh approval status'
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function sendForApproval() {
    if (inquiryBookingLocked) return;
    if (!supabase || !inquiryId || !projectId) return;
    const parsed = approvalValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before sending for approval.');
      return;
    }
    const offeredRaw = String(parsed.data.offeredPrice).trim();
    const offered = Number(offeredRaw);
    setSubmitting(true);
        try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const { data: inqRow } = await supabase
        .from('sales_inquiries')
        .select('customer_id')
        .eq('id', inquiryId)
        .maybeSingle();
      const customerId = String(
        (inqRow as { customer_id?: string } | null)?.customer_id || ''
      ).trim();
      const discountPct = computeNegotiationDiscount(listPrice, offered).discountPct;

      const { data: approvalRow, error: insErr } = await supabase
        .from('negotiation_approvals')
        .insert({
          sales_inquiry_id: inquiryId,
          project_id: projectId,
          unit_id: unitId || null,
          customer_id: customerId || null,
          list_price: listPrice,
          offered_price: offered,
          discount_pct: discountPct,
          request_note: data.notes?.trim() || null,
          requested_by: user?.id ?? null
        })
        .select('id')
        .single();
      if (insErr) {
        throw new Error(
          insErr.message.includes('negotiation_approvals_one_pending')
            ? 'A pending approval already exists for this enquiry.'
            : insErr.message
        );
      }
      const approvalId = String(
        (approvalRow as { id?: string } | null)?.id || ''
      );
      const persist = await persistNegotiationApprovalRequest(supabase, {
        inquiryId,
        approvalId,
        offeredPrice: offeredRaw,
        notes: data.notes?.trim() || undefined,
        funnelStage: 'Negotiation'
      });
      if (!persist.ok) {
        throw new Error(persist.error ?? 'Could not save negotiation stage');
      }
      onChange({
        ...data,
        offered_price: offeredRaw,
        approval_status: 'pending',
        approval_id: approvalId
      });
      onApprovalSubmitted?.();
    } catch (e) {
      pageError(
        e instanceof Error ? e.message : 'Could not submit approval request'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const formDisabled = inquiryBookingLocked || stagesReadOnly;

  return (
    <div className="grid gap-3">
      {listPrice ? (
        <div className="rounded-lg border border-ds-gray-200 bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">
            Unit list price
          </p>
          <p className="mt-1 text-sm font-semibold text-ds-gray-900">
            {formatInrCompactLacCr(listPrice)}
            <span className="ml-1 text-xs font-normal text-ds-gray-600">
              (₹ {formatInr(listPrice)})
            </span>
          </p>
          {discountInr != null && discountPct != null ? (
            <p className="mt-2 text-xs text-ds-gray-700">
              Discount requested:{' '}
              <span className="font-semibold text-ds-primary-700">
                ₹ {formatInr(discountInr)} ({discountPct}%)
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-ds-gray-500">
              Enter offered price to see discount vs list price.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          Unit list price is not set on this inventory row — approval will still
          record the offered price.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Offered price (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="75,00,000"
            value={data.offered_price ?? ''}
            onChange={(e) => {
              applyOfferedPrice(e.target.value);
              approvalValidation.touch('offeredPrice');
            }}
            onBlur={() => approvalValidation.touch('offeredPrice')}
            aria-invalid={
              approvalValidation.fieldError('offeredPrice') ? true : undefined
            }
            disabled={formDisabled}
          />
          <FormFieldError message={approvalValidation.fieldError('offeredPrice')} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Discount asked (%)</Label>
          <Input
            type="text"
            readOnly
            className="h-8 bg-ds-gray-50 text-xs"
            placeholder="—"
            value={discountPct != null ? String(discountPct) : ''}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Counter offer (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="72,00,000"
            value={data.counter_offer ?? ''}
            onChange={(e) =>
              onChange({ ...data, counter_offer: e.target.value })
            }
            disabled={formDisabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Expected close</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={data.expected_close ?? ''}
            onChange={(e) =>
              onChange({ ...data, expected_close: e.target.value })
            }
            disabled={formDisabled}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Terms discussed, concerns, agreement points…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          disabled={formDisabled}
        />
      </div>

      {inquiryId && projectId && supabase && !formDisabled ? (
        <div className="space-y-2 rounded-lg border border-ds-primary-200 bg-ds-primary-50/40 p-3">
          <p className="text-xs font-semibold text-ds-gray-800">
            Admin budget approval
          </p>
          {approvalStatus === 'pending' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-900">
                Awaiting admin decision — Super Admins review under CRM → Approvals.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={refreshing}
                onClick={() => void refreshApprovalStatus()}
              >
                {refreshing ? 'Checking…' : 'Refresh status'}
              </Button>
            </div>
          ) : null}
          {approvalStatus === 'approved' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-teal-900">
                Budget approved. Create a booking to record token and continue.
              </p>
              {onApprovedCreateBooking ? (
                <Button
                  type="button"
                  className="min-h-11 gap-1 bg-teal-600 hover:bg-teal-700"
                  disabled={submitting || refreshing || formDisabled}
                  onClick={() => void onApprovedCreateBooking()}
                >
                  Create booking
                  <ArrowRight className="size-3.5 opacity-90" />
                </Button>
              ) : null}
            </div>
          ) : null}
          {approvalStatus === 'rejected' ? (
            <p className="text-[11px] text-red-900">
              Budget rejected — update the offer and send again.
            </p>
          ) : null}
          {approvalStatus !== 'pending' && approvalStatus !== 'approved' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={submitting || formDisabled}
              onClick={() => void sendForApproval()}
            >
              {submitting ? 'Sending…' : 'Send for admin approval'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type InquiryPipelineInquiryContext = {
  customerName?: string;
  unitCode?: string;
};

export function InquiryPipelinePanel(props: {
  inquiry: InquiryPipelineRow | null;
  /** @deprecated Use `inquiry` */
  opportunity?: InquiryPipelineRow | null;
  /** Read-only enquiry record labels (customer + unit live on `sales_inquiries`). */
  inquiryContext?: InquiryPipelineInquiryContext;
  /** `sales_inquiries.unit_id` — when set, inventory `units.status` is updated from the saved funnel stage. */
  unitId?: string | null;
  unitStatus?: string | null;
  projectId?: string | null;
  customerId?: string | null;
  /** Hide Customer → Unit → Enquiry macro strip (parent page supplies top stepper). */
  hideMacroStepper?: boolean;
  /** Hide left vertical funnel nav (parent supplies top stepper). */
  hideVerticalStepper?: boolean;
  /** Controlled active stage when parent owns navigation. */
  activeStageOverride?: FunnelStage;
  onActiveStageChange?: (stage: FunnelStage) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const inquiry = props.inquiry ?? props.opportunity ?? null;
  const {
    inquiryContext,
    unitId,
    unitStatus,
    projectId,
    customerId,
    hideMacroStepper,
    hideVerticalStepper,
    activeStageOverride,
    onActiveStageChange,
    onSaved,
    onClose
  } = props;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [activeStageInternal, setActiveStageInternal] = useState<FunnelStage>('Enquiry');
  const [macroStep, setMacroStep] = useState<PipelineMacroStep>('enquiry');
  const [stageData, setStageData] = useState<StageData>(emptyStageData());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unitListPriceInr, setUnitListPriceInr] = useState<number | null>(null);
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null);
  const inquiryBookingLocked = Boolean(linkedBookingId);
  const inquiryUnitTokenLocked = inquiryStagesLockedByUnitToken(unitStatus);
  const stagesReadOnly = inquiryUnitTokenLocked;
  const activeStage = activeStageOverride ?? activeStageInternal;
  const setActiveStage = (stage: FunnelStage) => {
    if (inquiryNegotiationStageLocked(stage, inquiryBookingLocked)) {
      pageError(INQUIRY_ACTIVE_BOOKING_MESSAGE);
      return;
    }
    if (activeStageOverride === undefined) setActiveStageInternal(stage);
    onActiveStageChange?.(stage);
  };
  const negotiateFunnelForBooking =
    activeStage === 'Negotiation' ? 'Negotiation' : inquiry?.funnel_stage;

  const navigateToBooking = useCallback(() => {
    const inqId = String(inquiry?.id || '').trim();
    const pid = String(projectId || '').trim();
    const uid = String(unitId || '').trim();
    const cid = String(customerId || '').trim();
    if (!inqId || !pid || !uid || !cid) return;
    if (linkedBookingId) {
      pageError(INQUIRY_ACTIVE_BOOKING_MESSAGE);
      router.push(`/crm/bookings/${linkedBookingId}`);
      return;
    }
    const blockMsg = negotiationApprovalBlockMessage(stageData.negotiation, {
      funnelStage: negotiateFunnelForBooking
    });
    if (blockMsg) {
      pageError(blockMsg);
      return;
    }
    navigateToCreateBookingFromInquiry(router, {
      inquiryId: inqId,
      projectId: pid,
      customerId: cid,
      unitId: uid,
      stageData: stageDataToJson(stageData)
    });
  }, [
    inquiry?.id,
    projectId,
    unitId,
    customerId,
    stageData,
    router,
    negotiateFunnelForBooking,
    linkedBookingId
  ]);

  const pipelineClosed = isInquiryClosed(inquiry?.stage_data);

  const negotiationBlocksAdvance = tokenStageBlockedByNegotiation(
    stageData.negotiation,
    { funnelStage: negotiateFunnelForBooking }
  );

  useEffect(() => {
    const uid = String(unitId || '').trim();
    if (!uid) {
      setUnitListPriceInr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: unitRow } = await supabase
        .from('units')
        .select(
          'area, carpet_area, bua_area, rate, floor_rise_charge, plc_charge'
        )
        .eq('id', uid)
        .maybeSingle();
      if (cancelled) return;
      if (!unitRow) {
        setUnitListPriceInr(null);
        return;
      }
      setUnitListPriceInr(
        unitAgreementTotalInr(unitRow as UnitPricingInput) || null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, unitId]);

  useEffect(() => {
    const inqId = String(inquiry?.id || '').trim();
    if (!inqId) {
      setLinkedBookingId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const booking = await fetchActiveBookingForInquiry(supabase, inqId);
      if (!cancelled) setLinkedBookingId(booking?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiry?.id, supabase, saved]);

  useEffect(() => {
    if (!inquiry) return;
    let cancelled = false;
    void (async () => {
      const currentStage = pipelineUiStage(inquiry.funnel_stage);
      if (activeStageOverride === undefined) {
        setActiveStageInternal(currentStage);
      }
      setMacroStep('enquiry');
      const { data, error: loadErr } = await loadInquiryStageData(
        supabase,
        inquiry.id
      );
      if (cancelled) return;
      if (loadErr) {
        setStageData(mergeStageDataFromJson(inquiry.stage_data));
      } else {
        setStageData(mergeStageDataFromJson(data));
      }
            setSaved(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiry, supabase, activeStageOverride]);

  async function closeFromRejectedApproval(decisionNote?: string) {
    if (!inquiry) return;
    if (inquiryUnitTokenLocked) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    setSaving(true);
        try {
      const result = await closeInquiry(supabase, {
        inquiryId: inquiry.id,
        unitId: unitId ?? null,
        stageData: {
          ...stageDataToJson(stageData),
          negotiation: {
            ...stageData.negotiation,
            approval_status: 'rejected',
            ...(decisionNote ? { decision_note: decisionNote } : {})
          }
        },
        closedStatus: 'Rejected'
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not close enquiry');
      setSaved(true);
      onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setSaving(false);
    }
  }

  async function save(nextStage?: FunnelStage) {
    if (!inquiry) return;
    if (inquiryUnitTokenLocked) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    const targetStage = nextStage ?? activeStage;
    if (inquiryNegotiationStageLocked(targetStage, inquiryBookingLocked)) {
      pageError(INQUIRY_ACTIVE_BOOKING_MESSAGE);
      return;
    }
    setSaving(true);
        setSaved(false);
    try {
      const uid = String(unitId || '').trim();
      if (uid) {
        const unitResult = await applyUnitStatusForFunnelStage(
          supabase,
          uid,
          targetStage
        );
        if (unitResult.error) throw new Error(unitResult.error);
      }

      const saveResult = await saveInquiryStageData(supabase, {
        inquiryId: inquiry.id,
        patch: stageDataToJson(stageData),
        funnelStage: targetStage as InquiryFunnelStage,
        markStagesCompleted: [targetStage as InquiryFunnelStage]
      });
      if (!saveResult.ok) throw new Error(saveResult.error ?? 'Save failed');
      if (nextStage) setActiveStage(nextStage);
      setSaved(true);
      onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function advanceStage() {
    const currentIdx = stageIndex(activeStage);
    if (currentIdx < 0) return;
    const next = PIPELINE_STEPS[currentIdx + 1];
    if (next) void save(next.id);
  }

  async function handleCloseEnquiry() {
    if (!inquiry) return;
    if (inquiryUnitTokenLocked) {
      pageError(INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE);
      return;
    }
    setSaving(true);
        try {
      const result = await closeInquiry(supabase, {
        inquiryId: inquiry.id,
        unitId: unitId ?? null,
        stageData: stageDataToJson(stageData)
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not close enquiry');
      setSaved(true);
      onSaved();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setSaving(false);
    }
  }

  const isLastPipelineStage =
    stageIndex(activeStage) === PIPELINE_STEPS.length - 1;

  if (!inquiry) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Enquiry not found. Refresh the page or open it from the enquiry list.
        </p>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mt-1 space-y-3 pb-3">
        {!hideMacroStepper ? (
          <MacroPipelineStepper
            current={macroStep}
            onSelect={setMacroStep}
          />
        ) : null}

        {macroStep === 'customer' && (
          <div
            className="rounded-lg border border-border bg-muted/30 px-3 py-3 sm:px-4"
            role="region"
            aria-label="Customer on enquiry"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Customer
            </p>
            {inquiryContext?.customerName?.trim() ? (
              <p className="mt-2 text-sm font-medium text-foreground">
                {inquiryContext.customerName.trim()}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No customer name on this enquiry yet. Add it on the inquiry
                record.
              </p>
            )}
          </div>
        )}

        {macroStep === 'unit' && (
          <div
            className="rounded-lg border border-border bg-muted/30 px-3 py-3 sm:px-4"
            role="region"
            aria-label="Unit on enquiry"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Unit
            </p>
            {inquiryContext?.unitCode?.trim() ? (
              <>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {inquiryContext.unitCode.trim()}
                </p>
                {unitStatus ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inventory: {statusLabelForUnit(unitStatus)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No unit selected on this enquiry yet. Link a unit on the inquiry
                record.
              </p>
            )}
          </div>
        )}

        {macroStep === 'enquiry' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {!hideVerticalStepper ? (
              <VerticalEnquiryStageStepper
                current={activeStage}
                onSelect={(stage) => setActiveStage(stage)}
                canSelectStage={(stage) =>
                  !inquiryNegotiationStageLocked(stage, inquiryBookingLocked)
                }
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-3">
              {pipelineClosed ? (
                <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                  This enquiry is closed. The unit has been released to available inventory when applicable.
                </div>
              ) : null}
              {inquiryUnitTokenLocked ? <InquiryUnitTokenLockedBanner /> : null}
              {linkedBookingId ? (
                <InquiryBookingLockedBanner bookingId={linkedBookingId} />
              ) : null}
              <ActiveStageGuide stage={activeStage} />
              {activeStage === 'Enquiry' && (
                <EnquiryForm
                  data={stageData.enquiry ?? {}}
                  onChange={(d) => setStageData((s) => ({ ...s, enquiry: d }))}
                  readOnly={stagesReadOnly}
                />
              )}
              {activeStage === 'Qualified' && (
                <QualifiedForm
                  data={stageData.qualified ?? {}}
                  onChange={(d) => setStageData((s) => ({ ...s, qualified: d }))}
                  readOnly={stagesReadOnly}
                />
              )}
              {activeStage === 'Site Visit' && (
                <SiteVisitForm
                  data={stageData.site_visit ?? {}}
                  onChange={(d) =>
                    setStageData((s) => ({ ...s, site_visit: d }))
                  }
                  onAdvance={(stage) => void save(stage)}
                  onCreateBooking={() => navigateToBooking()}
                  onCloseEnquiry={() => void handleCloseEnquiry()}
                  saving={saving}
                  pipelineClosed={pipelineClosed}
                  inquiryBookingLocked={inquiryBookingLocked}
                  stagesReadOnly={stagesReadOnly}
                />
              )}
              {activeStage === 'Negotiation' && negotiationBlocksAdvance ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {getNegotiationApprovalStatus(stageData.negotiation) ===
                  'pending'
                    ? 'Admin approval is pending. Refresh status after decision — create a booking once approved.'
                    : 'Send the offered price for admin approval before creating a booking.'}
                </p>
              ) : null}
              {activeStage === 'Negotiation' && (
                <NegotiationForm
                  data={stageData.negotiation ?? {}}
                  onChange={(d) =>
                    setStageData((s) => ({ ...s, negotiation: d }))
                  }
                  inquiryId={inquiry.id}
                  projectId={projectId ?? null}
                  unitId={unitId ?? null}
                  listPriceInr={unitListPriceInr}
                  supabase={supabase}
                  onApprovedCreateBooking={() => navigateToBooking()}
                  onRejectedClose={(note) => void closeFromRejectedApproval(note)}
                  inquiryBookingLocked={inquiryBookingLocked}
                  stagesReadOnly={stagesReadOnly}
                  onApprovalSubmitted={() => {
                    void (async () => {
                      const { data } = await loadInquiryStageData(
                        supabase,
                        inquiry.id
                      );
                      setStageData(mergeStageDataFromJson(data));
                      onSaved();
                    })();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Close
        </Button>
        <div className="flex flex-wrap gap-2">
          {macroStep !== 'enquiry' ? (
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => {
                if (macroStep === 'customer') setMacroStep('unit');
                else if (macroStep === 'unit') setMacroStep('enquiry');
              }}
            >
              {macroStep === 'customer' ? 'Continue to unit' : 'Continue to pipeline'}
            </Button>
          ) : pipelineClosed || inquiryUnitTokenLocked ? null : (
            <>
              {projectId && unitId && customerId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={
                    saving || negotiationBlocksAdvance || inquiryBookingLocked
                  }
                  onClick={() => navigateToBooking()}
                >
                  Create booking
                  <ArrowRight className="size-3.5 opacity-90" />
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {!isLastPipelineStage &&
                activeStage !== 'Site Visit' &&
                !(activeStage === 'Negotiation' && negotiationBlocksAdvance) && (
                <Button
                  disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={() => advanceStage()}
                >
                  {saving ? 'Saving…' : 'Save & advance →'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
