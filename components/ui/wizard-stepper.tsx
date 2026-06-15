'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStepDef = {
  id: string;
  label: string;
};

export type WizardStepperProps = {
  steps: readonly WizardStepDef[];
  currentIndex: number;
  maxReachableIndex?: number;
  stepsWithData?: Set<string>;
  stepsWithUnsaved?: Set<string>;
  isStepDone?: (index: number, step: WizardStepDef) => boolean;
  canSelectStep?: (index: number, step: WizardStepDef) => boolean;
  onSelectStep?: (index: number, step: WizardStepDef) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

function defaultCanSelect(
  index: number,
  step: WizardStepDef,
  opts: {
    currentIndex: number;
    maxReachableIndex: number;
    stepsWithData?: Set<string>;
    onSelectStep?: WizardStepperProps['onSelectStep'];
    disabled?: boolean;
  }
) {
  const { currentIndex, maxReachableIndex, stepsWithData, onSelectStep, disabled } =
    opts;
  if (!onSelectStep || disabled) return false;
  const hasData = stepsWithData?.has(step.id) ?? false;
  return index <= maxReachableIndex || hasData || index === currentIndex;
}

export function WizardStepper({
  steps,
  currentIndex,
  maxReachableIndex,
  stepsWithData,
  stepsWithUnsaved,
  isStepDone,
  canSelectStep,
  onSelectStep,
  disabled,
  className,
  ariaLabel = 'Progress'
}: WizardStepperProps) {
  const safeCurrent = Math.max(
    0,
    Math.min(currentIndex, Math.max(0, steps.length - 1))
  );
  const maxIdx =
    maxReachableIndex != null
      ? Math.min(maxReachableIndex, steps.length - 1)
      : safeCurrent;
  const last = Math.max(steps.length - 1, 1);

  return (
    <div className={cn('overflow-x-auto pb-1', className)} aria-label={ariaLabel}>
      <div className="relative flex min-w-max items-start justify-between px-1">
        <div
          className="absolute left-0 right-0 top-[15px] h-0.5 bg-border"
          aria-hidden
          style={{ zIndex: 0 }}
        />
        {safeCurrent > 0 ? (
          <div
            className="absolute left-0 top-[15px] h-0.5 bg-teal-400 transition-all"
            aria-hidden
            style={{
              zIndex: 1,
              width: `${(safeCurrent / last) * 100}%`
            }}
          />
        ) : null}

        {steps.map((step, idx) => {
          const done = isStepDone
            ? isStepDone(idx, step)
            : idx < safeCurrent;
          const isActive = idx === safeCurrent;
          const hasData = stepsWithData?.has(step.id) ?? false;
          const hasUnsaved = stepsWithUnsaved?.has(step.id) ?? false;
          const selectable = canSelectStep
            ? canSelectStep(idx, step)
            : defaultCanSelect(idx, step, {
                currentIndex: safeCurrent,
                maxReachableIndex: maxIdx,
                stepsWithData,
                onSelectStep,
                disabled
              });

          const inner = (
            <>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-200'
                    : done
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : hasUnsaved
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : hasData
                          ? 'border-teal-300 bg-white text-teal-600'
                          : 'border-border bg-background text-muted-foreground'
                )}
              >
                {done ? (
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
                    : done || hasData
                      ? 'text-teal-600'
                      : hasUnsaved
                        ? 'text-amber-800'
                        : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </>
          );

          return (
            <div
              key={step.id}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1 px-2 sm:px-3"
            >
              {selectable ? (
                <button
                  type="button"
                  onClick={() => onSelectStep?.(idx, step)}
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

export type WizardStepperVerticalProps = WizardStepperProps & {
  stepNumber?: (index: number, step: WizardStepDef) => number;
};

export function WizardStepperVertical({
  steps,
  currentIndex,
  stepsWithData,
  isStepDone,
  canSelectStep,
  onSelectStep,
  disabled,
  className,
  ariaLabel = 'Progress',
  stepNumber
}: WizardStepperVerticalProps) {
  const safeCurrent = Math.max(
    0,
    Math.min(currentIndex, Math.max(0, steps.length - 1))
  );

  return (
    <nav
      className={cn(
        'shrink-0 rounded-lg border border-border bg-muted/20 p-2 sm:p-3 md:w-44',
        className
      )}
      aria-label={ariaLabel}
    >
      <ol className="flex flex-col">
        {steps.map((step, idx) => {
          const done = isStepDone
            ? isStepDone(idx, step)
            : idx < safeCurrent;
          const isActive = idx === safeCurrent;
          const isLast = idx === steps.length - 1;
          const hasData = stepsWithData?.has(step.id) ?? false;
          const selectable = canSelectStep
            ? canSelectStep(idx, step)
            : Boolean(onSelectStep) && !disabled;

          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => {
                  if (!selectable) return;
                  onSelectStep?.(idx, step);
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
                          : done
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : hasData
                              ? 'border-teal-300 bg-white text-teal-600'
                              : 'border-border bg-background text-muted-foreground'
                      )}
                    >
                      {done ? (
                        <Check className="size-3.5" strokeWidth={2.5} />
                      ) : (
                        stepNumber?.(idx, step) ?? idx + 1
                      )}
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
                      : done || hasData
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
