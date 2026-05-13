import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type EmailInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  inputClassName?: string;
};

export function EmailInputField({
  value,
  onChange,
  label = 'Email',
  placeholder,
  id,
  inputClassName
}: EmailInputFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="email"
        className={cn(inputClassName)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="email"
      />
    </div>
  );
}
