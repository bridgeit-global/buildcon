import { cn } from '@/lib/utils';

/** Fixed height for single-line fields: Input, Select trigger, combobox buttons. */
export const formControlHeightClass = 'h-10 min-h-10';

/** Standard single-line control sizing (use on Input / SelectTrigger / combobox Button). */
export const formControlClass = cn(
  formControlHeightClass,
  'w-full rounded-md px-3 py-0 text-sm transition-[color,box-shadow,border-color] duration-150'
);

/** Popover combobox triggers that should match Input height. */
export const formControlTriggerClass = cn(
  formControlHeightClass,
  'flex w-full items-center justify-between gap-2 px-3 py-0 text-left text-sm font-normal transition-[color,box-shadow,border-color] duration-150'
);

/** Invalid state border and focus ring for form controls. */
export const formControlInvalidClass =
  'border-ds-error-500 focus-visible:border-ds-error-500 focus-visible:ring-ds-error-500/30';

/** Spacing between a field label and its control. */
export const formControlFieldGapClass = 'mt-1.5';
