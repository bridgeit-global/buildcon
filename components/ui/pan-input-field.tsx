import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';
import {
  normalizePan,
  isPanValid,
  isPanPrefixValid
} from '@/lib/customer/kyc-identifiers';

export type PanInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  labelClassName?: string;
  required?: boolean;
  error?: string;
};

function getRealtimeError(raw: string): string | undefined {
  const pan = normalizePan(raw);
  if (!pan) return undefined;
  if (!isPanPrefixValid(pan)) {
    return 'PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).';
  }
  if (pan.length === 10 && !isPanValid(pan)) {
    return 'Enter a valid PAN (e.g. ABCDE1234F).';
  }
  return undefined;
}

export function PanInputField({
  value,
  onChange,
  label = 'PAN',
  placeholder = 'ABCDE1234F',
  id,
  inputClassName,
  labelClassName,
  required,
  error
}: PanInputFieldProps) {
  const [touched, setTouched] = useState(false);
  const realtimeError = touched ? getRealtimeError(value) : undefined;
  const displayError = error || realtimeError;

  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        className={cn(formControlFieldGapClass, 'uppercase', inputClassName)}
        aria-invalid={displayError ? true : undefined}
        value={value}
        onChange={(e) => onChange(normalizePan(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        maxLength={10}
        autoComplete="off"
      />
      {displayError ? (
        <p className="mt-0.5 text-xs text-red-600">{displayError}</p>
      ) : null}
    </div>
  );
}
