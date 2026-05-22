'use client';

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NewInquiryWizard } from '../new-inquiry-wizard';
import {
  InquiryPipelinePanel,
  type InquiryPipelineRow
} from '../inquiry-pipeline-dialog';
import { funnelUnitAlignmentMessage } from '../inquiry-stage-unit-map';
import {
  INQUIRY_PIPELINE_UI_STAGES,
  funnelStageRank,
  inquiryWizardStepForView,
  maxReachablePipelineUiIndex,
  pipelineUiStage,
  type InquiryFunnelStage,
  type InquiryPipelineUiStage
} from '../inquiry-funnel-stages';
import { InquiryFunnelStepper } from '../inquiry-funnel-stepper';
import {
  fetchActiveBookingForInquiry,
  inquiryNegotiationStageLocked,
  inquiryStagesLockedByUnitToken
} from '../inquiry-booking-guard';
import { advanceInquiryToNegotiation } from '../inquiry-stage-transitions';
import {
  loadInquiryStageData,
  stageHasMeaningfulData
} from '../inquiry-stage-store';
type InquiryFetchRow = {
  id: string;
  project_id: string;
  customer_id: string;
  unit_id: string;
  funnel_stage: string;
  assigned_to: string | null;
  stage_data: InquiryPipelineRow['stage_data'];
  customers: { full_name: string } | null;
  units: { unit_code: string; status?: string | null } | null;
};


function NewInquiryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const resumeInquiryId = useMemo(
    () => searchParams.get('inquiry')?.trim() ?? '',
    [searchParams]
  );

  const [wizardStep, setWizardStep] = useState(1);
  const [viewStage, setViewStage] =
    useState<InquiryPipelineUiStage>('Enquiry');
  const [inquiry, setInquiry] = useState<InquiryPipelineRow | null>(null);
  const [funnelStage, setFunnelStage] = useState('Enquiry');
  const [unitStatus, setUnitStatus] = useState<string | null>(null);
  const [inquiryId, setInquiryId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [inquiryUnitId, setInquiryUnitId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [stagesWithData, setStagesWithData] = useState<Set<InquiryFunnelStage>>(
    () => new Set()
  );
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null);
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
          project_id,
          customer_id,
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
      const { data: stageData } = await loadInquiryStageData(supabase, id);
      const fs = String(row.funnel_stage || 'Enquiry').trim();
      const uiStage = pipelineUiStage(fs);

      setInquiry({
        id: row.id,
        funnel_stage: row.funnel_stage,
        assigned_to: row.assigned_to,
        stage_data: stageData
      });
      const booking = await fetchActiveBookingForInquiry(supabase, id);
      setLinkedBookingId(booking?.id ?? null);
      const atOrPastNegotiation =
        funnelStageRank(fs) >= funnelStageRank('Negotiation');
      const negotiationLocked = inquiryNegotiationStageLocked(
        'Negotiation',
        Boolean(booking?.id)
      );

      setFunnelStage(fs);
      if (atOrPastNegotiation && !negotiationLocked) {
        setViewStage('Negotiation');
        setWizardStep(inquiryWizardStepForView('Negotiation', fs));
      } else {
        setViewStage(uiStage);
        setWizardStep(inquiryWizardStepForView(uiStage, fs));
      }
      if (row.customers?.full_name) setCustomerName(row.customers.full_name);
      if (row.units?.unit_code) setUnitCode(row.units.unit_code);
      const st = row.units?.status;
      setUnitStatus(st != null && String(st).trim() !== '' ? String(st) : null);
      setInquiryUnitId(String(row.unit_id || '').trim());
      setCustomerId(String(row.customer_id || '').trim());
      setProjectId(String(row.project_id || '').trim());

      const filled = new Set<InquiryPipelineUiStage>();
      for (const stage of INQUIRY_PIPELINE_UI_STAGES) {
        if (stageHasMeaningfulData(stage, stageData)) filled.add(stage);
      }
      if (stageHasMeaningfulData('Token', stageData)) {
        filled.add('Negotiation');
      }
      setStagesWithData(filled);

      return true;
    },
    [supabase]
  );

  useEffect(() => {
    if (!resumeInquiryId) {
      setResumeReady(true);
      setResumeError(false);
      if (prevResumeInquiryRef.current) {
        setInquiryId('');
        setInquiry(null);
        setWizardStep(1);
        setViewStage('Enquiry');
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
        setUnitStatus(null);
        setInquiryUnitId('');
        setCustomerId('');
        setProjectId('');
        setStagesWithData(new Set());
        setLinkedBookingId(null);
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
      } else {
        setResumeError(true);
        setInquiry(null);
        setInquiryId('');
        setWizardStep(1);
        setViewStage('Enquiry');
        setFunnelStage('Enquiry');
        setCustomerName('');
        setUnitCode('');
        setUnitStatus(null);
        setInquiryUnitId('');
        setCustomerId('');
        setProjectId('');
        setStagesWithData(new Set());
        setLinkedBookingId(null);
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
      await loadInquiry(id);
    },
    [loadInquiry]
  );

  const handleSkipToStage = useCallback(
    async (stage: InquiryFunnelStage) => {
      const ui = pipelineUiStage(stage);
      if (inquiryNegotiationStageLocked(ui, Boolean(linkedBookingId))) return;
      if (ui === 'Negotiation' && inquiryId) {
        const result = await advanceInquiryToNegotiation(supabase, {
          inquiryId
        });
        if (!result.ok) {
          pageError(result.error ?? 'Could not open negotiate stage');
          return;
        }
        await loadInquiry(inquiryId);
        return;
      }
      setViewStage(ui);
      if (ui === 'Negotiation') setFunnelStage('Negotiation');
    },
    [linkedBookingId, inquiryId, supabase, loadInquiry]
  );

  const handleStageSelect = useCallback(
    (stage: InquiryPipelineUiStage) => {
      if (!inquiryId && stage !== 'Enquiry' && stage !== 'Qualified') return;
      if (inquiryNegotiationStageLocked(stage, Boolean(linkedBookingId))) return;
      if (stage === 'Negotiation') {
        void handleSkipToStage('Negotiation');
        return;
      }
      setViewStage(stage);
      setWizardStep(inquiryWizardStepForView(stage, funnelStage));
    },
    [inquiryId, linkedBookingId, funnelStage, handleSkipToStage]
  );

  const handleFunnelStageChange = useCallback((stage: string) => {
    setFunnelStage(stage);
    const ui = pipelineUiStage(stage);
    setViewStage(ui);
    setWizardStep(inquiryWizardStepForView(ui, stage));
  }, []);

  const handleStageDataSaved = useCallback(() => {
    if (inquiryId) void loadInquiry(inquiryId);
  }, [inquiryId, loadInquiry]);

  const handlePipelineStageChange = useCallback(
    (stage: InquiryPipelineUiStage) => {
      if (inquiryNegotiationStageLocked(stage, Boolean(linkedBookingId))) return;
      setViewStage(stage);
    },
    [linkedBookingId]
  );

  const inquiryUnitTokenLocked = inquiryStagesLockedByUnitToken(unitStatus);

  const pipelineUnitStageNote = useMemo(
    () =>
      funnelUnitAlignmentMessage(
        funnelStage,
        unitStatus,
        inquiry?.stage_data
      ),
    [funnelStage, unitStatus, inquiry?.stage_data]
  );

  const headerTitle =
    customerName && inquiryId ? customerName : 'New enquiry';

  const headerSub =
    inquiryId && (unitCode || funnelStage)
      ? [unitCode, pipelineUiStage(funnelStage)].filter(Boolean).join(' · ')
      : 'Customer & unit preferences, then qualify a unit and record the site visit.';

  const resuming = Boolean(resumeInquiryId && !resumeReady);
  const maxReachableIndex = inquiryId
    ? maxReachablePipelineUiIndex(funnelStage, wizardStep)
    : Math.min(wizardStep - 1, INQUIRY_PIPELINE_UI_STAGES.length - 1);

  const showPipelinePanel =
    Boolean(inquiryId) && viewStage === 'Negotiation';

  const showWizard =
    !showPipelinePanel &&
    (viewStage === 'Enquiry' ||
      viewStage === 'Qualified' ||
      viewStage === 'Site Visit');

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
            {headerSub ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {headerSub}
              </p>
            ) : null}
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {inquiryId ? 'Pipeline' : 'New enquiry'}
          </span>
        </div>

        <div className="border-b border-border bg-muted/5 px-4 py-4 sm:px-6">
          <InquiryFunnelStepper
            currentStage={viewStage}
            maxReachableIndex={maxReachableIndex}
            stagesWithData={stagesWithData}
            disabled={resuming}
            onSelect={inquiryId || wizardStep > 1 ? handleStageSelect : undefined}
          />
        </div>

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

              {showWizard ? (
                <NewInquiryWizard
                  hideStepper
                  inquiryId={inquiryId || undefined}
                  forcedStep={wizardStep as 1 | 2 | 3}
                  stagesReadOnly={inquiryUnitTokenLocked}
                  onStepChange={setWizardStep}
                  onCreated={(id) => void handleInquiryCreated(id)}
                  onFunnelStageChange={handleFunnelStageChange}
                  onStageDataSaved={handleStageDataSaved}
                  onSkipToStage={handleSkipToStage}
                />
              ) : null}

              {showPipelinePanel && inquiry ? (
                <InquiryPipelinePanel
                  inquiry={inquiry}
                  unitId={inquiryUnitId || null}
                  unitStatus={unitStatus}
                  projectId={projectId || null}
                  customerId={customerId || null}
                  hideMacroStepper
                  hideVerticalStepper
                  activeStageOverride={viewStage}
                  onActiveStageChange={handlePipelineStageChange}
                  inquiryContext={{
                    customerName: customerName || undefined,
                    unitCode: unitCode || undefined
                  }}
                  onSaved={() => {
                    if (inquiryId) void loadInquiry(inquiryId);
                  }}
                  onClose={() => router.push('/crm/inquiry')}
                />
              ) : null}
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
