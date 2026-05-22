import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn(labelClassName)}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <Input
        id={id}
        type="email"
        className={cn(inputClassName)}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="email"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
