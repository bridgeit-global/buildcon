import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';
import { normalizeAadhaar } from '@/lib/customer/kyc-identifiers';

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
  if (!digits || digits.length === 12) return undefined;
  return 'Aadhaar must be 12 digits.';
}

export function AadhaarInputField({
  value,
  onChange,
  label = 'Aadhaar number',
  placeholder = '123456789012',
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
      <FormFieldError message={displayError} />
    </div>
  );
}
