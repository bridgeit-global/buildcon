'use client';

import {
  funnelStageIndex,
  INQUIRY_PIPELINE_UI_STAGES,
  type InquiryFunnelStage,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';

export { funnelStageIndex };
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
