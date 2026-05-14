'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const PIPELINE_STEPS: { id: FunnelStage; label: string; step: number }[] = [
  { id: 'Enquiry', label: 'Enquiry', step: 1 },
  { id: 'Qualified', label: 'Qualified', step: 2 },
  { id: 'Site Visit', label: 'Site Visit', step: 3 },
  { id: 'Negotiation', label: 'Negotiation', step: 4 },
  { id: 'Token', label: 'Token', step: 5 }
];

function stageIndex(s: string) {
  return PIPELINE_STEPS.findIndex((p) => p.id === s);
}

// ─── stage_data shape ─────────────────────────────────────────────────────────

export type EnquiryStageData = {
  assigned_to?: string;
  follow_up_date?: string;
  notes?: string;
};
export type QualifiedStageData = {
  budget_min?: string;
  budget_max?: string;
  financing?: string;
  temperature?: string;
  follow_up_date?: string;
  notes?: string;
};
export type SiteVisitStageData = {
  scheduled_at?: string;
  status?: string;
  outcome?: string;
  notes?: string;
};
export type NegotiationStageData = {
  offered_price?: string;
  discount_pct?: string;
  counter_offer?: string;
  expected_close?: string;
  notes?: string;
};
export type TokenStageData = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
};
export type StageData = {
  enquiry?: EnquiryStageData;
  qualified?: QualifiedStageData;
  site_visit?: SiteVisitStageData;
  negotiation?: NegotiationStageData;
  token?: TokenStageData;
};

// ─── Row type (must match page.tsx query) ────────────────────────────────────

type FollowRow = {
  id: string;
  due_at: string;
  note: string | null;
  completed_at: string | null;
};

export type OpportunityRow = {
  id: string;
  funnel_stage: string;
  assigned_to: string | null;
  stage_data?: StageData | null;
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

function mergeStageData(existing: unknown): StageData {
  const base = emptyStageData();
  if (!existing || typeof existing !== 'object') return base;
  const e = existing as Partial<StageData>;
  return {
    enquiry: { ...base.enquiry, ...(e.enquiry ?? {}) },
    qualified: { ...base.qualified, ...(e.qualified ?? {}) },
    site_visit: { ...base.site_visit, ...(e.site_visit ?? {}) },
    negotiation: { ...base.negotiation, ...(e.negotiation ?? {}) },
    token: { ...base.token, ...(e.token ?? {}) }
  };
}

// ─── Stepper UI ───────────────────────────────────────────────────────────────

function PipelineStepper({
  current,
  onSelect
}: {
  current: string;
  onSelect: (stage: FunnelStage) => void;
}) {
  const currentIdx = stageIndex(current);
  return (
    <div className="relative flex items-start justify-between px-2">
      {/* connecting line */}
      <div
        className="absolute left-0 right-0 top-[18px] h-0.5 bg-border"
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
            className="relative z-10 flex flex-col items-center gap-1.5 focus:outline-none"
            aria-current={isActive ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
                isActive
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : isDone
                    ? 'border-emerald-500 bg-white text-emerald-600'
                    : 'border-border bg-white text-muted-foreground'
              )}
            >
              {step.step}
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold leading-tight',
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
  );
}

// ─── Stage form panels ────────────────────────────────────────────────────────

function EnquiryForm({
  data,
  onChange,
  members,
  assignedTo,
  onAssignedToChange
}: {
  data: EnquiryStageData;
  onChange: (d: EnquiryStageData) => void;
  members: { user_id: string; name: string }[];
  assignedTo: string;
  onAssignedToChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs">Assigned to</Label>
        <Select
          value={assignedTo || '__unassigned__'}
          onValueChange={(v) =>
            onAssignedToChange(v === '__unassigned__' ? '' : v)
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Follow-up date</Label>
        <Input
          type="datetime-local"
          className="h-9 text-xs"
          value={data.follow_up_date ?? ''}
          onChange={(e) => onChange({ ...data, follow_up_date: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[72px] text-xs"
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
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Budget Min (₹)</Label>
          <Input
            type="number"
            className="h-9 text-xs"
            placeholder="e.g. 5000000"
            value={data.budget_min ?? ''}
            onChange={(e) => onChange({ ...data, budget_min: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Budget Max (₹)</Label>
          <Input
            type="number"
            className="h-9 text-xs"
            placeholder="e.g. 8000000"
            value={data.budget_max ?? ''}
            onChange={(e) => onChange({ ...data, budget_max: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Financing</Label>
          <Select
            value={data.financing ?? ''}
            onValueChange={(v) => onChange({ ...data, financing: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Self-funded">Self-funded</SelectItem>
              <SelectItem value="Bank Loan">Bank Loan</SelectItem>
              <SelectItem value="Mix">Mix</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Lead temperature</Label>
          <Select
            value={data.temperature ?? ''}
            onValueChange={(v) => onChange({ ...data, temperature: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Hot">🔥 Hot</SelectItem>
              <SelectItem value="Warm">🌤 Warm</SelectItem>
              <SelectItem value="Cold">❄️ Cold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Next follow-up date</Label>
        <Input
          type="datetime-local"
          className="h-9 text-xs"
          value={data.follow_up_date ?? ''}
          onChange={(e) =>
            onChange({ ...data, follow_up_date: e.target.value })
          }
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Qualification notes</Label>
        <Textarea
          className="min-h-[72px] text-xs"
          placeholder="Buyer's requirements, concerns, pre-approval status…"
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
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs">Visit date &amp; time</Label>
        <Input
          type="datetime-local"
          className="h-9 text-xs"
          value={data.scheduled_at ?? ''}
          onChange={(e) =>
            onChange({ ...data, scheduled_at: e.target.value })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Visit status</Label>
          <Select
            value={data.status ?? ''}
            onValueChange={(v) => onChange({ ...data, status: v })}
          >
            <SelectTrigger className="h-9">
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
          <Select
            value={data.outcome ?? ''}
            onValueChange={(v) => onChange({ ...data, outcome: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Interested">Interested</SelectItem>
              <SelectItem value="Need Another Visit">Need Another Visit</SelectItem>
              <SelectItem value="Not Interested">Not Interested</SelectItem>
              <SelectItem value="Undecided">Undecided</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Visit notes / feedback</Label>
        <Textarea
          className="min-h-[72px] text-xs"
          placeholder="Buyer's feedback, property highlights shown…"
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
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Offered price (₹ total)</Label>
          <Input
            type="number"
            className="h-9 text-xs"
            placeholder="e.g. 7500000"
            value={data.offered_price ?? ''}
            onChange={(e) =>
              onChange({ ...data, offered_price: e.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Discount requested (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            className="h-9 text-xs"
            placeholder="e.g. 5"
            value={data.discount_pct ?? ''}
            onChange={(e) =>
              onChange({ ...data, discount_pct: e.target.value })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Our counter offer (₹)</Label>
          <Input
            type="number"
            className="h-9 text-xs"
            placeholder="e.g. 7200000"
            value={data.counter_offer ?? ''}
            onChange={(e) =>
              onChange({ ...data, counter_offer: e.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Expected close date</Label>
          <Input
            type="date"
            className="h-9 text-xs"
            value={data.expected_close ?? ''}
            onChange={(e) =>
              onChange({ ...data, expected_close: e.target.value })
            }
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Negotiation notes</Label>
        <Textarea
          className="min-h-[72px] text-xs"
          placeholder="Terms discussed, buyer concerns, agreement points…"
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
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Token amount (₹)</Label>
          <Input
            type="number"
            className="h-9 text-xs"
            placeholder="e.g. 100000"
            value={data.amount ?? ''}
            onChange={(e) => onChange({ ...data, amount: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Token date</Label>
          <Input
            type="date"
            className="h-9 text-xs"
            value={data.date ?? ''}
            onChange={(e) => onChange({ ...data, date: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Payment mode</Label>
          <Select
            value={data.mode ?? ''}
            onValueChange={(v) => onChange({ ...data, mode: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
              <SelectItem value="NEFT/RTGS">NEFT / RTGS</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Cheque / UTR / UPI ref</Label>
          <Input
            className="h-9 text-xs"
            placeholder="Reference number"
            value={data.reference ?? ''}
            onChange={(e) => onChange({ ...data, reference: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Token notes</Label>
        <Textarea
          className="min-h-[60px] text-xs"
          placeholder="Remarks, bank name, handover details…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

// ─── Main panel (full page or embedded in a dialog) ───────────────────────────

export function InquiryPipelinePanel(props: {
  projectId: string;
  opportunity: OpportunityRow | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { projectId, opportunity, onSaved, onClose } = props;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [activeStage, setActiveStage] = useState<FunnelStage>('Enquiry');
  const [assignedTo, setAssignedTo] = useState('');
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>(
    []
  );
  const [stageData, setStageData] = useState<StageData>(emptyStageData());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!opportunity) return;
    const currentStage = (opportunity.funnel_stage ?? 'Enquiry') as FunnelStage;
    const inPipeline = PIPELINE_STEPS.some((p) => p.id === currentStage);
    setActiveStage(inPipeline ? currentStage : 'Enquiry');
    setAssignedTo(opportunity.assigned_to ?? '');
    setStageData(mergeStageData(opportunity.stage_data));
    setError('');
    setSaved(false);
  }, [opportunity]);

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    const { data: memRows } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('status', 'Active');
    if (!memRows?.length) { setMembers([]); return; }
    const ids = memRows.map((r) => r.user_id as string);
    const { data: profRows } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', ids);
    const nameBy = new Map(
      (profRows ?? []).map((p) => [p.id as string, (p.name as string) || p.id])
    );
    setMembers(ids.map((id) => ({ user_id: id, name: nameBy.get(id) ?? id })));
  }, [projectId, supabase]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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
          funnel_stage: targetStage,
          assigned_to: assignedTo.trim() || null,
          stage_data: stageData
        })
        .eq('id', opportunity.id);
      if (uErr) throw uErr;
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
    const next = PIPELINE_STEPS[currentIdx + 1];
    if (next) void save(next.id);
  }

  const isLastPipelineStage =
    stageIndex(activeStage) === PIPELINE_STEPS.length - 1;

  if (!opportunity) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          No opportunity row is linked to this inquiry yet. Save the inquiry again
          or refresh after migration.
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
      <div className="mt-1 pb-4">
        <PipelineStepper
          current={activeStage}
          onSelect={(stage) => setActiveStage(stage)}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      {saved && !error ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Saved successfully.
        </div>
      ) : null}

      <div className="mt-2">
        {activeStage === 'Enquiry' && (
          <EnquiryForm
            data={stageData.enquiry ?? {}}
            onChange={(d) => setStageData((s) => ({ ...s, enquiry: d }))}
            members={members}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Close
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {!isLastPipelineStage && (
            <Button
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
