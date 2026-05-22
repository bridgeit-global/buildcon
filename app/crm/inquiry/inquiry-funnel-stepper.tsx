'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  INQUIRY_PIPELINE_UI_STAGES,
  pipelineUiStage,
  type InquiryFunnelStage,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';

export const FUNNEL_STEP_LABELS: Record<InquiryPipelineUiStage, string> = {
  Enquiry: 'Enquiry',
  Qualified: 'Qualified',
  'Site Visit': 'Visit site',
  Negotiation: 'Negotiate'
};

export function funnelStageIndex(stage: string): number {
  const t = pipelineUiStage(stage);
  const idx = INQUIRY_PIPELINE_UI_STAGES.indexOf(t);
  return idx >= 0 ? idx : 0;
}

type InquiryFunnelStepperProps = {
  currentStage: string;
  maxReachableIndex?: number;
  stagesWithData?: Set<InquiryFunnelStage | InquiryPipelineUiStage>;
  onSelect?: (stage: InquiryPipelineUiStage) => void;
  disabled?: boolean;
  className?: string;
};

export function InquiryFunnelStepper({
  currentStage,
  maxReachableIndex,
  stagesWithData,
  onSelect,
  disabled,
  className
}: InquiryFunnelStepperProps) {
  const currentIdx = funnelStageIndex(currentStage);
  const maxIdx =
    maxReachableIndex != null
      ? Math.min(maxReachableIndex, INQUIRY_PIPELINE_UI_STAGES.length - 1)
      : currentIdx;
  const last = INQUIRY_PIPELINE_UI_STAGES.length - 1;

  return (
    <div
      className={cn('overflow-x-auto pb-1', className)}
      aria-label="Enquiry pipeline progress"
    >
      <div className="relative flex min-w-max items-start justify-between px-1">
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          aria-hidden
          style={{ zIndex: 0 }}
        />
        {currentIdx > 0 ? (
          <div
            className="absolute left-0 top-[15px] h-0.5 bg-teal-400 transition-all"
            aria-hidden
            style={{
              zIndex: 1,
              width: `${(currentIdx / last) * 100}%`
            }}
          />
        ) : null}

        {INQUIRY_PIPELINE_UI_STAGES.map((stage, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const hasData = stagesWithData?.has(stage) ?? false;
          const canSelect =
            Boolean(onSelect) &&
            !disabled &&
            (idx <= maxIdx || hasData || idx === currentIdx);

          const inner = (
            <>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-200'
                    : isDone
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : hasData
                        ? 'border-teal-300 bg-white text-teal-600'
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
                    : isDone || hasData
                      ? 'text-teal-600'
                      : 'text-muted-foreground'
                )}
              >
                {FUNNEL_STEP_LABELS[stage]}
              </span>
            </>
          );

          return (
            <div
              key={stage}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1 px-2 sm:px-3"
            >
              {canSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(stage)}
                  className="flex min-h-11 min-w-[44px] flex-col items-center gap-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={isActive ? 'step' : undefined}
                >
                  {inner}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1 opacity-70">
                  {inner}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
