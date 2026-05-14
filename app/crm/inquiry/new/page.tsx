'use client';

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useActiveProjectContext } from '../../_components/active-project-context';
import { NewInquiryWizard } from '../new-inquiry-wizard';
import {
  InquiryPipelinePanel,
  type OpportunityRow
} from '../inquiry-pipeline-dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InquiryFetchRow = {
  id: string;
  customers: { full_name: string } | null;
  units: { unit_code: string } | null;
  sales_opportunities: OpportunityRow | OpportunityRow[] | null;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

// ─── Unified 7-step flow ──────────────────────────────────────────────────────

const FLOW_STAGES = [
  { id: 'customer', label: 'Customer', phase: 'create' as const },
  { id: 'unit', label: 'Unit', phase: 'create' as const },
  { id: 'enquiry', label: 'Enquiry', phase: 'pipeline' as const },
  { id: 'qualified', label: 'Qualified', phase: 'pipeline' as const },
  { id: 'site_visit', label: 'Site Visit', phase: 'pipeline' as const },
  { id: 'negotiation', label: 'Negotiate', phase: 'pipeline' as const },
  { id: 'token', label: 'Token', phase: 'pipeline' as const }
] as const;

const FUNNEL_STAGE_TO_IDX: Record<string, number> = {
  Enquiry: 2,
  Qualified: 3,
  'Site Visit': 4,
  Negotiation: 5,
  Token: 6,
  Booking: 6,
  Won: 6
};

// ─── FlowProgress ─────────────────────────────────────────────────────────────

function FlowProgress({
  wizardStep,
  phase,
  funnelStage
}: {
  wizardStep: number;
  phase: 'create' | 'pipeline';
  funnelStage: string;
}) {
  const currentIdx =
    phase === 'create'
      ? wizardStep >= 2
        ? 1
        : 0
      : (FUNNEL_STAGE_TO_IDX[funnelStage] ?? 2);

  return (
    <div className="overflow-x-auto pb-1" aria-label="Enquiry pipeline progress">
      <div className="relative flex min-w-max items-start justify-between px-1">
        {/* Connector track */}
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          aria-hidden
          style={{ zIndex: 0 }}
        />
        {/* Completed portion overlay */}
        {currentIdx > 0 && (
          <div
            className="absolute left-0 top-[15px] h-0.5 bg-emerald-400 transition-all"
            aria-hidden
            style={{
              zIndex: 1,
              width: `${(currentIdx / (FLOW_STAGES.length - 1)) * 100}%`
            }}
          />
        )}

        {FLOW_STAGES.map((stage, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const isPipelineStart = idx === 2;

          return (
            <div
              key={stage.id}
              className="relative z-10 flex flex-col items-center gap-1 px-2 sm:px-3"
            >
              {/* Divider marker before pipeline stages */}
              {isPipelineStart && (
                <span
                  className="absolute -left-2 top-3 hidden h-3 w-px bg-border sm:block"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : isDone
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-border bg-background text-muted-foreground'
                )}
              >
                {isDone ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : (
                  idx + 1
                )}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-[10px] font-semibold leading-tight',
                  isActive
                    ? 'text-emerald-700'
                    : isDone
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Phase badge ──────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: 'create' | 'pipeline' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        phase === 'create'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-emerald-100 text-emerald-700'
      )}
    >
      {phase === 'create' ? 'New enquiry' : 'Pipeline'}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewInquiryPageInner() {
  const { activeProjectId } = useActiveProjectContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const resumeInquiryId = useMemo(
    () => searchParams.get('inquiry')?.trim() ?? '',
    [searchParams]
  );

  const [wizardStep, setWizardStep] = useState(1);
  const [phase, setPhase] = useState<'create' | 'pipeline'>('create');
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [opportunity, setOpportunity] = useState<OpportunityRow | null>(null);
  const [funnelStage, setFunnelStage] = useState('Enquiry');
  const [inquiryId, setInquiryId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [resumeReady, setResumeReady] = useState(() => !resumeInquiryId);
  const [resumeError, setResumeError] = useState(false);
  const prevResumeInquiryRef = useRef('');

  const loadOpportunity = useCallback(
    async (id: string): Promise<boolean> => {
      if (!activeProjectId) return false;
      const { data } = await supabase
        .from('sales_inquiries')
        .select(
          `
          id,
          customers ( full_name ),
          units ( unit_code ),
          sales_opportunities (
            id,
            funnel_stage,
            assigned_to,
            sales_pipeline_stages ( id, stage, payload, updated_at ),
            sales_follow_ups ( id, due_at, note, completed_at )
          )
        `
        )
        .eq('id', id)
        .eq('project_id', activeProjectId)
        .maybeSingle();

      if (!data) return false;
      const row = data as unknown as InquiryFetchRow;
      const opp = embedOne(row.sales_opportunities);
      setOpportunity(opp);
      if (opp?.funnel_stage) setFunnelStage(opp.funnel_stage);
      if (row.customers?.full_name) setCustomerName(row.customers.full_name);
      if (row.units?.unit_code) setUnitCode(row.units.unit_code);
      return true;
    },
    [supabase, activeProjectId]
  );

  useEffect(() => {
    if (!resumeInquiryId) {
      setResumeReady(true);
      setResumeError(false);
      if (prevResumeInquiryRef.current) {
        setPhase('create');
        setInquiryId('');
        setOpportunity(null);
        setWizardStep(1);
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
      }
      prevResumeInquiryRef.current = '';
      return;
    }
    if (!activeProjectId) return;

    prevResumeInquiryRef.current = resumeInquiryId;
    let cancelled = false;
    setResumeReady(false);
    setResumeError(false);

    void (async () => {
      const ok = await loadOpportunity(resumeInquiryId);
      if (cancelled) return;
      if (ok) {
        setInquiryId(resumeInquiryId);
        setPhase('pipeline');
        setWizardStep(2);
      } else {
        setResumeError(true);
        setOpportunity(null);
        setInquiryId('');
        setPhase('create');
        setWizardStep(1);
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
      }
      setResumeReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeInquiryId, activeProjectId, loadOpportunity]);

  const handleInquiryCreated = useCallback(
    async (id: string) => {
      setInquiryId(id);
      setLoadingPipeline(true);
      await loadOpportunity(id);
      setLoadingPipeline(false);
      setPhase('pipeline');
    },
    [loadOpportunity]
  );

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to add an enquiry.
      </Card>
    );
  }

  const headerTitle =
    phase === 'pipeline' && customerName ? customerName : 'New enquiry';

  const headerSub =
    phase === 'create'
      ? 'Fill in customer details and select a unit to create the enquiry.'
      : [unitCode, funnelStage].filter(Boolean).join(' · ');

  const resuming = Boolean(resumeInquiryId && !resumeReady);

  return (
    <div className="flex flex-col gap-4">
      {/* Back navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 px-2" asChild>
          <Link href="/crm/inquiry">
            <ArrowLeft className="size-4" />
            Leads overview
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {/* ── Card header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {headerTitle}
            </h1>
            {headerSub && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {headerSub}
              </p>
            )}
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {/* ── Unified 7-step progress bar ──────────────────────────────────── */}
        <div className="border-b border-border bg-muted/5 px-4 py-4 sm:px-6">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {phase === 'create' ? 'Creating enquiry' : 'Pipeline progress'}
          </p>
          <FlowProgress
            wizardStep={wizardStep}
            phase={phase}
            funnelStage={funnelStage}
          />
        </div>

        {/* ── Content area ─────────────────────────────────────────────────── */}
        <div className="px-4 py-4 sm:px-6">
          {resuming ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-border border-t-emerald-600" />
              <p className="text-sm text-muted-foreground">Loading enquiry…</p>
            </div>
          ) : resumeError && resumeInquiryId ? (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                This enquiry was not found for the current project, or you no
                longer have access.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/crm/inquiry">Leads overview</Link>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.replace('/crm/inquiry/new')}
                >
                  New enquiry
                </Button>
              </div>
            </div>
          ) : phase === 'create' ? (
            <NewInquiryWizard
              projectId={activeProjectId}
              hideStepper
              onStepChange={setWizardStep}
              onCreated={(id) => void handleInquiryCreated(id)}
            />
          ) : loadingPipeline ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-border border-t-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Setting up pipeline…
              </p>
            </div>
          ) : (
            <InquiryPipelinePanel
              opportunity={opportunity}
              inquiryContext={{
                customerName: customerName || undefined,
                unitCode: unitCode || undefined
              }}
              onSaved={() => {
                if (inquiryId) void loadOpportunity(inquiryId);
              }}
              onClose={() => router.push('/crm/inquiry')}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

export default function NewInquiryPage() {
  return (
    <Suspense
      fallback={
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Loading…
        </Card>
      }
    >
      <NewInquiryPageInner />
    </Suspense>
  );
}
