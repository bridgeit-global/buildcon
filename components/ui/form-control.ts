import { cn } from '@/lib/utils';

/** Fixed height for single-line fields: Input, Select trigger, combobox buttons. */
export const formControlHeightClass = 'h-9 min-h-9';

/** Standard single-line control sizing (use on Input / SelectTrigger / combobox Button). */
export const formControlClass = cn(
  formControlHeightClass,
  'w-full rounded-md px-3 py-0 text-sm'
);

/** Popover combobox triggers that should match Input height. */
export const formControlTriggerClass = cn(
  formControlHeightClass,
  'w-full justify-between px-3 py-0 text-left text-sm font-normal'
);

/** Spacing between a field label and its control. */
export const formControlFieldGapClass = 'mt-1';
