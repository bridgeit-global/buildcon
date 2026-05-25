import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';
import {
  normalizeAadhaar,
  isAadhaarValid
} from '@/lib/customer/kyc-identifiers';

export type AadhaarInputFieldProps = {
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
  const digits = normalizeAadhaar(raw);
  if (!digits) return undefined;
  if (/^[01]/.test(digits)) {
    return 'Aadhaar cannot start with 0 or 1.';
  }
  if (digits.length === 12 && !isAadhaarValid(digits)) {
    return 'Enter a valid 12-digit Aadhaar number.';
  }
  return undefined;
}

export function AadhaarInputField({
  value,
  onChange,
  label = 'Aadhaar number',
  placeholder = '1234 5678 9012',
  id,
  inputClassName,
  labelClassName,
  required,
  error
}: AadhaarInputFieldProps) {
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
        className={cn(formControlFieldGapClass, inputClassName)}
        aria-invalid={displayError ? true : undefined}
        value={value}
        onChange={(e) => onChange(normalizeAadhaar(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        maxLength={12}
        inputMode="numeric"
        autoComplete="off"
      />
      {displayError ? (
        <p className="mt-0.5 text-xs text-red-600">{displayError}</p>
      ) : null}
    </div>
  );
}
