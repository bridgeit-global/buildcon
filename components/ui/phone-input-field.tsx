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
import { phoneLengthForOption } from '@/lib/phone/country-dial-codes';
import { cn } from '@/lib/utils';

export type PhoneInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  /** `digits10` keeps up to N numeric digits, N being the selected country's mobile number length (10 for India). Default allows any text. */
  mode?: 'free' | 'digits10';
  inputClassName?: string;
  labelClassName?: string;
  required?: boolean;
  error?: string;
  /** Show the searchable country-code select beside the number input. Defaults to true. */
  showCountryCode?: boolean;
  /** Controls the selected country dial-code option from the parent (e.g. to drive length-aware validation). Falls back to internal state (defaults to India) when omitted. */
  countryCode?: string;
  /** Notified whenever the country picker changes, whether or not `countryCode` is controlled. */
  onCountryCodeChange?: (value: string) => void;
};

export function PhoneInputField({
  value,
  onChange,
  label = 'Phone',
  placeholder,
  id,
  mode = 'digits10',
  inputClassName,
  labelClassName,
  required,
  error,
  showCountryCode = true,
  countryCode,
  onCountryCodeChange
}: PhoneInputFieldProps) {
  const [internalCountryCode, setInternalCountryCode] = useState(
    DEFAULT_COUNTRY_DIAL_CODE_OPTION
  );
  const currentCountryCode = countryCode ?? internalCountryCode;
  const maxDigits = mode === 'digits10' ? phoneLengthForOption(currentCountryCode) : undefined;

  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <div className={cn('flex gap-2', formControlFieldGapClass)}>
        {showCountryCode && (
          <CountryCodeSelect
            value={currentCountryCode}
            onValueChange={(next) => {
              if (countryCode === undefined) setInternalCountryCode(next);
              onCountryCodeChange?.(next);
              if (mode === 'digits10') {
                onChange(value.replace(/\D/g, '').slice(0, phoneLengthForOption(next)));
              }
            }}
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
            if (mode === 'digits10' && maxDigits) {
              onChange(
                String(e.target.value || '')
                  .replace(/\D/g, '')
                  .slice(0, maxDigits)
              );
            } else {
              onChange(e.target.value);
            }
          }}
          placeholder={placeholder ?? (maxDigits ? `${maxDigits}-digit mobile number` : 'Enter Phone number')}
          inputMode={mode === 'digits10' ? 'numeric' : 'tel'}
          maxLength={maxDigits}
          autoComplete="tel"
        />
      </div>
      <FormFieldError message={error} />
    </div>
  );
}
