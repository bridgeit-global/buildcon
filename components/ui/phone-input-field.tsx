'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass, formControlInvalidClass } from '@/components/ui/form-control';
import {
  CountryCodeSelect,
  DEFAULT_COUNTRY_DIAL_CODE_OPTION
} from '@/components/ui/country-code-select';
import { cn } from '@/lib/utils';

export type PhoneInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  /** `digits10` keeps up to 10 numeric digits (Indian mobile). Default allows any text. */
  mode?: 'free' | 'digits10';
  inputClassName?: string;
  labelClassName?: string;
  required?: boolean;
  error?: string;
  /** Show the searchable country-code select beside the number input. Defaults to true. */
  showCountryCode?: boolean;
};

export function PhoneInputField({
  value,
  onChange,
  label = 'Phone',
  placeholder = 'Enter Phone number',
  id,
  mode = 'digits10',
  inputClassName,
  labelClassName,
  required,
  error,
  showCountryCode = true
}: PhoneInputFieldProps) {
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_DIAL_CODE_OPTION);

  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <div className={cn('flex gap-2', formControlFieldGapClass)}>
        {showCountryCode && (
          <CountryCodeSelect
            value={countryCode}
            onValueChange={setCountryCode}
            error={Boolean(error)}
          />
        )}
        <Input
          id={id}
          className={cn(
            'flex-1',
            error ? formControlInvalidClass : undefined,
            inputClassName
          )}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => {
            if (mode === 'digits10') {
              onChange(
                String(e.target.value || '')
                  .replace(/\D/g, '')
                  .slice(0, 10)
              );
            } else {
              onChange(e.target.value);
            }
          }}
          placeholder={placeholder}
          inputMode={mode === 'digits10' ? 'numeric' : 'tel'}
          maxLength={mode === 'digits10' ? 10 : undefined}
          autoComplete="tel"
        />
      </div>
      <FormFieldError message={error} />
    </div>
  );
}
