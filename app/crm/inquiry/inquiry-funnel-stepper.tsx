'use client';

import {
  INQUIRY_PIPELINE_UI_STAGES,
  pipelineUiStage,
  type InquiryFunnelStage,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';
import { WizardStepper } from '@/components/ui/wizard-stepper';

export const FUNNEL_STEP_LABELS: Record<InquiryPipelineUiStage, string> = {
  Enquiry: 'Enquiry',
  Qualified: 'Qualified',
  'Site Visit': 'Visit site',
  Negotiation: 'Negotiate'
};

const FUNNEL_STEPS = INQUIRY_PIPELINE_UI_STAGES.map((stage) => ({
  id: stage,
  label: FUNNEL_STEP_LABELS[stage]
}));

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

  return (
    <WizardStepper
      className={className}
      steps={FUNNEL_STEPS}
      currentIndex={currentIdx}
      maxReachableIndex={maxReachableIndex}
      stepsWithData={stagesWithData}
      disabled={disabled}
      ariaLabel="Enquiry pipeline progress"
      onSelectStep={
        onSelect
          ? (_idx, step) => onSelect(step.id as InquiryPipelineUiStage)
          : undefined
      }
    />
  );
}
