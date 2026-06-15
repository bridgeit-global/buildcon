import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';

export type EmailInputFieldProps = {
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

export function EmailInputField({
  value,
  onChange,
  label = 'Email',
  placeholder,
  id,
  inputClassName,
  labelClassName,
  required,
  error
}: EmailInputFieldProps) {
  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="email"
        className={cn(formControlFieldGapClass, inputClassName)}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="email"
      />
      <FormFieldError message={error} />
    </div>
  );
}
