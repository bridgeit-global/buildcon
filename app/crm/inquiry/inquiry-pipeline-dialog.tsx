'use client';

import { useEffect, useMemo, useState } from 'react';
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

// ─── Stage definitions ────────────────────────────────────────────────────────

export const FUNNEL_STAGES = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token',
  'Booking',
  'Won',
  'Lost'
] as const;
type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** First five funnel columns: one DB row per stage in `sales_pipeline_stages`. */
const PIPELINE_ANCHOR_STAGES = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token'
] as const;
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
      'Confirm customer details and unit choice on the enquiry, and capture cost sheet or quotation notes here.'
  },
  {
    id: 'Qualified',
    label: 'Qualified',
    step: 2,
    summary: 'Confirm fit: budget range, financing appetite, and how hot the lead is.'
  },
  {
    id: 'Site Visit',
    label: 'Site Visit',
    step: 3,
    summary:
      'Schedule the visit, record status, and capture on-site feedback and impressions.'
  },
  {
    id: 'Negotiation',
    label: 'Negotiate',
    step: 4,
    summary:
      'Track price discussion, discounts or counter-offers, and what was agreed verbally.'
  },
  {
    id: 'Token',
    label: 'Token',
    step: 5,
    summary:
      'Record token amount, date, payment mode, and reference when the buyer commits.'
  }
];

function stageIndex(s: string) {
  return PIPELINE_STEPS.findIndex((p) => p.id === s);
}

// ─── In-memory stage form shape (persisted as `sales_pipeline_stages.payload`) ─

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
};
type TokenStageData = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
};
type StageData = {
  enquiry?: EnquiryStageData;
  qualified?: QualifiedStageData;
  site_visit?: SiteVisitStageData;
  negotiation?: NegotiationStageData;
  token?: TokenStageData;
};

// ─── Row type ─────────────────────────────────────────────────────────────────

type FollowRow = {
  id: string;
  due_at: string;
  note: string | null;
  completed_at: string | null;
};

type PipelineStageRowDb = {
  id: string;
  stage: string;
  payload: Record<string, unknown> | null;
  updated_at?: string;
};

export type OpportunityRow = {
  id: string;
  funnel_stage: string;
  assigned_to: string | null;
  sales_pipeline_stages?:
    | PipelineStageRowDb[]
    | PipelineStageRowDb
    | null;
  sales_follow_ups?: FollowRow[] | FollowRow | null;
};

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

function embedList<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function mergeStageDataFromPipelineRows(
  rows: PipelineStageRowDb[] | null | undefined
): StageData {
  const base = emptyStageData();
  if (!rows?.length) return base;
  for (const r of rows) {
    const raw = r.payload;
    const patch =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    switch (r.stage) {
      case 'Enquiry':
        base.enquiry = { ...base.enquiry, ...patch };
        break;
      case 'Qualified':
        base.qualified = { ...base.qualified, ...patch };
        break;
      case 'Site Visit':
        base.site_visit = { ...base.site_visit, ...patch };
        break;
      case 'Negotiation':
        base.negotiation = { ...base.negotiation, ...patch };
        break;
      case 'Token':
        base.token = { ...base.token, ...patch };
        break;
      default:
        break;
    }
  }
  return base;
}

// ─── Shared toggle helper ─────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: string }[];
  value: T | undefined | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
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

// ─── Pipeline stepper ─────────────────────────────────────────────────────────

function PipelineStepper({
  current,
  onSelect
}: {
  current: string;
  onSelect: (stage: PipelineAnchorStage) => void;
}) {
  const currentIdx = stageIndex(current);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative flex min-w-max items-start justify-between gap-0 px-1">
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          style={{ zIndex: 0 }}
          aria-hidden
        />
        {PIPELINE_STEPS.map((step, idx) => {
          const isActive = step.id === current;
          const isDone = idx < currentIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelect(step.id)}
              className="relative z-10 flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  isActive
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : isDone
                      ? 'border-emerald-500 bg-white text-emerald-600'
                      : 'border-border bg-white text-muted-foreground'
                )}
              >
                {isDone ? '✓' : step.step}
              </span>
              <span
                className={cn(
                  'max-w-20 text-center text-[10px] font-semibold leading-tight sm:max-w-24',
                  isActive
                    ? 'text-emerald-700'
                    : isDone
                      ? 'text-emerald-600'
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
  onChange
}: {
  data: EnquiryStageData;
  onChange: (d: EnquiryStageData) => void;
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
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Initial enquiry notes…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function QualifiedForm({
  data,
  onChange
}: {
  data: QualifiedStageData;
  onChange: (d: QualifiedStageData) => void;
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
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Requirements, concerns, pre-approval status…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function SiteVisitForm({
  data,
  onChange
}: {
  data: SiteVisitStageData;
  onChange: (d: SiteVisitStageData) => void;
}) {
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
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Visit status</Label>
        <Select
          value={data.status ?? ''}
          onValueChange={(v) => onChange({ ...data, status: v })}
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
          options={[
            { value: 'Interested', label: 'Interested' },
            { value: 'Need Another Visit', label: 'Another visit' },
            { value: 'Undecided', label: 'Undecided' },
            { value: 'Not Interested', label: 'Not interested' }
          ]}
          value={data.outcome ?? ''}
          onChange={(v) => onChange({ ...data, outcome: v })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Notes / feedback</Label>
        <Textarea
          className="min-h-[64px] resize-y text-xs"
          placeholder="Buyer's feedback, highlights shown…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function NegotiationForm({
  data,
  onChange
}: {
  data: NegotiationStageData;
  onChange: (d: NegotiationStageData) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Offered price (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="75,00,000"
            value={data.offered_price ?? ''}
            onChange={(e) =>
              onChange({ ...data, offered_price: e.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Discount asked (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            className="h-8 text-xs"
            placeholder="5"
            value={data.discount_pct ?? ''}
            onChange={(e) =>
              onChange({ ...data, discount_pct: e.target.value })
            }
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
        />
      </div>
    </div>
  );
}

function TokenForm({
  data,
  onChange
}: {
  data: TokenStageData;
  onChange: (d: TokenStageData) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Token amount (₹)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="1,00,000"
            value={data.amount ?? ''}
            onChange={(e) => onChange({ ...data, amount: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Token date</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={data.date ?? ''}
            onChange={(e) => onChange({ ...data, date: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Payment mode</Label>
        <ToggleGroup
          options={[
            { value: 'Cash', label: 'Cash' },
            { value: 'Cheque', label: 'Cheque' },
            { value: 'NEFT/RTGS', label: 'NEFT/RTGS' },
            { value: 'UPI', label: 'UPI' }
          ]}
          value={data.mode ?? ''}
          onChange={(v) => onChange({ ...data, mode: v })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Cheque / UTR / UPI ref</Label>
        <Input
          className="h-8 text-xs"
          placeholder="Reference number"
          value={data.reference ?? ''}
          onChange={(e) => onChange({ ...data, reference: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[56px] resize-y text-xs"
          placeholder="Bank name, handover details…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type InquiryPipelineInquiryContext = {
  customerName?: string;
  unitCode?: string;
};

export function InquiryPipelinePanel(props: {
  opportunity: OpportunityRow | null;
  /** Read-only enquiry record labels (customer + unit live on `sales_inquiries`). */
  inquiryContext?: InquiryPipelineInquiryContext;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { opportunity, inquiryContext, onSaved, onClose } = props;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [activeStage, setActiveStage] = useState<FunnelStage>('Enquiry');
  const [stageData, setStageData] = useState<StageData>(emptyStageData());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!opportunity) return;
    const currentStage = (opportunity.funnel_stage ?? 'Enquiry') as FunnelStage;
    const inPipeline = PIPELINE_STEPS.some((p) => p.id === currentStage);
    setActiveStage(inPipeline ? currentStage : 'Enquiry');
    setStageData(
      mergeStageDataFromPipelineRows(
        embedList(opportunity.sales_pipeline_stages)
      )
    );
    setError('');
    setSaved(false);
  }, [opportunity]);

  async function save(nextStage?: FunnelStage) {
    if (!opportunity) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const targetStage = nextStage ?? activeStage;
      const { error: uErr } = await supabase
        .from('sales_opportunities')
        .update({
          funnel_stage: targetStage
        })
        .eq('id', opportunity.id);
      if (uErr) throw uErr;

      const payloadByStage: Record<PipelineAnchorStage, object> = {
        Enquiry: stageData.enquiry ?? {},
        Qualified: stageData.qualified ?? {},
        'Site Visit': stageData.site_visit ?? {},
        Negotiation: stageData.negotiation ?? {},
        Token: stageData.token ?? {}
      };
      const stageRows = PIPELINE_STEPS.map(({ id }) => ({
        opportunity_id: opportunity.id,
        stage: id,
        payload: payloadByStage[id]
      }));
      const { error: pErr } = await supabase
        .from('sales_pipeline_stages')
        .upsert(stageRows, { onConflict: 'opportunity_id,stage' });
      if (pErr) throw pErr;
      if (nextStage) setActiveStage(nextStage);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
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

  const isLastPipelineStage =
    stageIndex(activeStage) === PIPELINE_STEPS.length - 1;

  if (!opportunity) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          No opportunity row linked to this inquiry. Save the inquiry again or
          refresh after migration.
        </p>
        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mt-1 space-y-3 pb-3">
        <PipelineStepper
          current={activeStage}
          onSelect={(stage) => setActiveStage(stage)}
        />
        {inquiryContext &&
          (inquiryContext.customerName?.trim() ||
            inquiryContext.unitCode?.trim()) &&
          activeStage === 'Enquiry' && (
            <div className="rounded-md border border-dashed border-border bg-background/80 px-3 py-2 text-xs leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Enquiry record</span>
              {inquiryContext.customerName?.trim() ? (
                <span className="mt-0.5 block">
                  Customer: {inquiryContext.customerName.trim()}
                </span>
              ) : null}
              {inquiryContext.unitCode?.trim() ? (
                <span className="mt-0.5 block">
                  Unit: {inquiryContext.unitCode.trim()}
                </span>
              ) : null}
            </div>
          )}
        <ActiveStageGuide stage={activeStage} />
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : saved ? (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
          Saved.
        </div>
      ) : null}

      <div>
        {activeStage === 'Enquiry' && (
          <EnquiryForm
            data={stageData.enquiry ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, enquiry: d }))}
          />
        )}
        {activeStage === 'Qualified' && (
          <QualifiedForm
            data={stageData.qualified ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, qualified: d }))}
          />
        )}
        {activeStage === 'Site Visit' && (
          <SiteVisitForm
            data={stageData.site_visit ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, site_visit: d }))}
          />
        )}
        {activeStage === 'Negotiation' && (
          <NegotiationForm
            data={stageData.negotiation ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, negotiation: d }))}
          />
        )}
        {activeStage === 'Token' && (
          <TokenForm
            data={stageData.token ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, token: d }))}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
          Close
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {!isLastPipelineStage && (
            <Button
              size="sm"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => advanceStage()}
            >
              {saving ? 'Saving…' : 'Save & advance →'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
