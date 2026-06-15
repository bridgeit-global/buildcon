import * as React from 'react';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';

export type TextInputFieldProps = Omit<
  React.ComponentPropsWithoutRef<'input'>,
  'className'
> & {
  label?: string;
  labelClassName?: string;
  inputClassName?: string;
  className?: string;
  required?: boolean;
  error?: string;
};

export const TextInputField = React.forwardRef<
  HTMLInputElement,
  TextInputFieldProps
>(function TextInputField(
  {
    label,
    labelClassName,
    inputClassName,
    className,
    required,
    error,
    id,
    'aria-invalid': ariaInvalid,
    ...inputProps
  },
  ref
) {
  const invalid = error ? true : ariaInvalid;

  return (
    <div className={className}>
      {label ? (
        <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      <Input
        ref={ref}
        id={id}
        className={cn(label ? formControlFieldGapClass : undefined, inputClassName)}
        aria-invalid={invalid}
        {...inputProps}
      />
      <FormFieldError message={error} />
    </div>
  );
});

TextInputField.displayName = 'TextInputField';
