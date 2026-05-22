import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn(labelClassName)}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <Input
        id={id}
        className={cn(inputClassName)}
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
