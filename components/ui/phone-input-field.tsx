import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
};

export function PhoneInputField({
  value,
  onChange,
  label = 'Phone',
  placeholder = 'Enter mobile number',
  id,
  mode = 'digits10',
  inputClassName
}: PhoneInputFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={cn(inputClassName)}
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
  );
}
