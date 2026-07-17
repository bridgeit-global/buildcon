import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass, formControlInvalidClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';
import {
  isPassportPrefixValid,
  isPassportValid,
  normalizePassport,
  passportValidationMessage
} from '@/lib/customer/kyc-identifiers';

export type PassportInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  residentialStatus?: string | null;
  label?: string;
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  labelClassName?: string;
  required?: boolean;
  error?: string;
};

function getRealtimeError(
  raw: string,
  residentialStatus?: string | null
): string | undefined {
  const passport = normalizePassport(raw);
  if (!passport) return undefined;
  if (!isPassportPrefixValid(passport, residentialStatus)) {
    return passportValidationMessage(residentialStatus);
  }
  const status = String(residentialStatus ?? '').trim().toLowerCase();
  if (status === 'nri' && passport.length === 8 && !isPassportValid(passport, residentialStatus)) {
    return passportValidationMessage(residentialStatus);
  }
  if (
    status === 'foreign national' &&
    passport.length >= 6 &&
    !isPassportValid(passport, residentialStatus)
  ) {
    return passportValidationMessage(residentialStatus);
  }
  return undefined;
}

export function PassportInputField({
  value,
  onChange,
  residentialStatus,
  label = 'Passport no. (NRI / foreign)',
  placeholder = 'K1234567',
  id,
  inputClassName,
  labelClassName,
  required,
  error
}: PassportInputFieldProps) {
  const [touched, setTouched] = useState(false);
  const realtimeError = touched ? getRealtimeError(value, residentialStatus) : undefined;
  const displayError = error || realtimeError;
  const status = String(residentialStatus ?? '').trim().toLowerCase();
  const maxLength = status === 'nri' ? 8 : 12;

  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        className={cn(
          formControlFieldGapClass,
          'uppercase',
          displayError ? formControlInvalidClass : undefined,
          inputClassName
        )}
        aria-invalid={displayError ? true : undefined}
        value={value}
        onChange={(e) => onChange(normalizePassport(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
      />
      <FormFieldError message={displayError} />
    </div>
  );
}
