import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { formControlFieldGapClass } from '@/components/ui/form-control';
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
  error
}: PhoneInputFieldProps) {
  return (
    <div>
      <FieldLabel htmlFor={id} className={cn(labelClassName)} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        className={cn(formControlFieldGapClass, inputClassName)}
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
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
