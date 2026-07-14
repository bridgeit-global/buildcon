import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass, formControlInvalidClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';

export type TextareaFieldProps = Omit<
  React.ComponentPropsWithoutRef<'textarea'>,
  'className'
> & {
  label?: string;
  labelClassName?: string;
  textareaClassName?: string;
  className?: string;
  required?: boolean;
  error?: string;
};

export const TextareaField = React.forwardRef<
  HTMLTextAreaElement,
  TextareaFieldProps
>(function TextareaField(
  {
    label,
    labelClassName,
    textareaClassName,
    className,
    required,
    error,
    id,
    'aria-invalid': ariaInvalid,
    ...textareaProps
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
      <Textarea
        ref={ref}
        id={id}
        className={cn(
          label ? formControlFieldGapClass : undefined,
          error ? formControlInvalidClass : undefined,
          textareaClassName
        )}
        aria-invalid={invalid}
        {...textareaProps}
      />
      <FormFieldError message={error} />
    </div>
  );
});

TextareaField.displayName = 'TextareaField';
