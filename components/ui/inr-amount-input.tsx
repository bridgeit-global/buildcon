'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
  formatInrAmountInputDisplay,
  sanitizeInrAmountInput
} from '@/lib/inr-amount-input';

export type InrAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  /** Raw numeric string (no commas), e.g. "500000". */
  value: string;
  onChange: (value: string) => void;
};

export const InrAmountInput = React.forwardRef<HTMLInputElement, InrAmountInputProps>(
  function InrAmountInput({ value, onChange, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatInrAmountInputDisplay(value)}
        onChange={(e) => onChange(sanitizeInrAmountInput(e.target.value))}
        {...props}
      />
    );
  }
);
