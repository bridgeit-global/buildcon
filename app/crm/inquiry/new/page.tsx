'use client';

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { NewInquiryWizard } from '../new-inquiry-wizard';
import {
  InquiryPipelinePanel,
  type InquiryPipelineRow
} from '../inquiry-pipeline-dialog';
import { funnelUnitAlignmentMessage } from '../inquiry-stage-unit-map';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InquiryFetchRow = {
  id: string;
  unit_id: string;
  funnel_stage: string;
  assigned_to: string | null;
  stage_data: InquiryPipelineRow['stage_data'];
  customers: { full_name: string } | null;
  units: { unit_code: string; status?: string | null } | null;
};

// ─── New enquiry: 3 macro steps (pipeline sub-stages live in InquiryPipelinePanel) ─

const MACRO_FLOW_STAGES = [
  { id: 'customer', label: 'Customer' },
  { id: 'unit', label: 'Unit' },
  { id: 'enquiry', label: 'Enquiry' }
] as const;

/** Wizard steps: 1 = Customer, 2 = Unit, 3 = Review — map to macro indices 0–2. */
function createPhaseMacroIndex(wizardStep: number) {
  if (wizardStep <= 1) return 0;
  if (wizardStep === 2) return 1;
  return 2;
}

// ─── FlowProgress (create phase only) ─────────────────────────────────────────

function FlowProgress({ wizardStep }: { wizardStep: number }) {
  const currentIdx = createPhaseMacroIndex(wizardStep);
  const last = MACRO_FLOW_STAGES.length - 1;

  return (
    <div className="overflow-x-auto pb-1" aria-label="New enquiry progress">
      <div className="relative flex min-w-max items-start justify-between px-1">
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          aria-hidden
          style={{ zIndex: 0 }}
        />
        {currentIdx > 0 && (
          <div
            className="absolute left-0 top-[15px] h-0.5 bg-teal-400 transition-all"
            aria-hidden
            style={{
              zIndex: 1,
              width: `${(currentIdx / last) * 100}%`
            }}
          />
        )}

        {MACRO_FLOW_STAGES.map((stage, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;

          return (
            <div
              key={stage.id}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1 px-2 sm:px-3"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-200'
                    : isDone
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
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
                  'max-w-22 text-center text-[10px] font-semibold leading-tight sm:max-w-none sm:whitespace-nowrap',
                  isActive
                    ? 'text-teal-700'
                    : isDone
                      ? 'text-teal-600'
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
          ? 'bg-slate-100 text-slate-700'
          : 'bg-teal-100 text-teal-800'
      )}
    >
      {phase === 'create' ? 'New enquiry' : 'Pipeline'}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewInquiryPageInner() {
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
  const [inquiry, setInquiry] = useState<InquiryPipelineRow | null>(null);
  const [funnelStage, setFunnelStage] = useState('Enquiry');
  const [unitStatus, setUnitStatus] = useState<string | null>(null);
  const [inquiryId, setInquiryId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [inquiryUnitId, setInquiryUnitId] = useState('');
  const [resumeReady, setResumeReady] = useState(() => !resumeInquiryId);
  const [resumeError, setResumeError] = useState(false);
  const prevResumeInquiryRef = useRef('');

  const loadInquiry = useCallback(
    async (id: string): Promise<boolean> => {
      const { data } = await supabase
        .from('sales_inquiries')
        .select(
          `
          id,
          unit_id,
          funnel_stage,
          assigned_to,
          stage_data,
          customers ( full_name ),
          units ( unit_code, status )
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (!data) return false;
      const row = data as unknown as InquiryFetchRow;
      setInquiry({
        id: row.id,
        funnel_stage: row.funnel_stage,
        assigned_to: row.assigned_to,
        stage_data: row.stage_data
      });
      if (row.funnel_stage) setFunnelStage(row.funnel_stage);
      if (row.customers?.full_name) setCustomerName(row.customers.full_name);
      if (row.units?.unit_code) setUnitCode(row.units.unit_code);
      const st = row.units?.status;
      setUnitStatus(st != null && String(st).trim() !== '' ? String(st) : null);
      setInquiryUnitId(String(row.unit_id || '').trim());
      return true;
    },
    [supabase]
  );

  useEffect(() => {
    if (!resumeInquiryId) {
      setResumeReady(true);
      setResumeError(false);
      if (prevResumeInquiryRef.current) {
        setPhase('create');
        setInquiryId('');
        setInquiry(null);
        setWizardStep(1);
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
        setUnitStatus(null);
        setInquiryUnitId('');
      }
      prevResumeInquiryRef.current = '';
      return;
    }
    prevResumeInquiryRef.current = resumeInquiryId;
    let cancelled = false;
    setResumeReady(false);
    setResumeError(false);

    void (async () => {
      const ok = await loadInquiry(resumeInquiryId);
      if (cancelled) return;
      if (ok) {
        setInquiryId(resumeInquiryId);
        setPhase('pipeline');
        setWizardStep(2);
      } else {
        setResumeError(true);
        setInquiry(null);
        setInquiryId('');
        setPhase('create');
        setWizardStep(1);
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
        setUnitStatus(null);
        setInquiryUnitId('');
      }
      setResumeReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeInquiryId, loadInquiry]);

  const handleInquiryCreated = useCallback(
    async (id: string) => {
      setInquiryId(id);
      setLoadingPipeline(true);
      await loadInquiry(id);
      setLoadingPipeline(false);
      setPhase('pipeline');
    },
    [loadInquiry]
  );

  const pipelineUnitStageNote = useMemo(
    () => funnelUnitAlignmentMessage(funnelStage, unitStatus),
    [funnelStage, unitStatus]
  );

  const headerTitle =
    phase === 'pipeline' && customerName ? customerName : 'New enquiry';

  const headerSub =
    phase === 'create'
      ? 'Fill in customer details and select a unit to create the enquiry.'
      : [unitCode, funnelStage].filter(Boolean).join(' · ');

  const resuming = Boolean(resumeInquiryId && !resumeReady);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="gap-1 px-2" asChild>
          <Link href="/crm/inquiry">
            <ArrowLeft className="size-4" />
            Leads overview
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-slate-200/90 p-0 shadow-sm">
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

        {phase === 'create' ? (
          <div className="border-b border-border bg-muted/5 px-4 py-4 sm:px-6">
            <FlowProgress wizardStep={wizardStep} />
          </div>
        ) : null}

        <div className="px-4 py-4 sm:px-6">
          {resuming ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-border border-t-teal-600" />
              <p className="text-sm text-muted-foreground">Loading enquiry…</p>
            </div>
          ) : resumeError && resumeInquiryId ? (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                This enquiry was not found, or you no longer have access.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/crm/inquiry">Leads overview</Link>
                </Button>
                <Button
                  variant="default"
                  onClick={() => router.replace('/crm/inquiry/new')}
                >
                  New enquiry
                </Button>
              </div>
            </div>
          ) : phase === 'create' ? (
            <NewInquiryWizard
              hideStepper
              onStepChange={setWizardStep}
              onCreated={(id) => void handleInquiryCreated(id)}
            />
          ) : loadingPipeline ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-border border-t-teal-600" />
              <p className="text-sm text-muted-foreground">
                Setting up pipeline…
              </p>
            </div>
          ) : (
            <>
              {pipelineUnitStageNote ? (
                <div
                  role="status"
                  className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950"
                >
                  {pipelineUnitStageNote}
                </div>
              ) : null}
              <InquiryPipelinePanel
                inquiry={inquiry}
                unitId={inquiryUnitId || null}
                unitStatus={unitStatus}
                inquiryContext={{
                  customerName: customerName || undefined,
                  unitCode: unitCode || undefined
                }}
                onSaved={() => {
                  if (inquiryId) void loadInquiry(inquiryId);
                }}
                onClose={() => router.push('/crm/inquiry')}
              />
            </>
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
