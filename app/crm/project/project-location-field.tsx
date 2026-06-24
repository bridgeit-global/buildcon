'use client';

import { Loader2, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { Input } from '@/components/ui/input';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { useGeolocation } from '@/lib/address/use-geolocation';
import { cn } from '@/lib/utils';

type ProjectLocationFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  labelClassName?: string;
  className?: string;
  placeholder?: string;
};

export function ProjectLocationField({
  value,
  onChange,
  onBlur,
  error,
  disabled,
  required,
  labelClassName,
  className,
  placeholder = 'e.g. Pune, Maharashtra'
}: ProjectLocationFieldProps) {
  const { loading, detectLocation } = useGeolocation();

  async function handleUseLocation() {
    if (disabled || loading) return;
    const location = await detectLocation();
    if (location) {
      onChange(location);
      onBlur?.();
    }
  }

  return (
    <div className={cn('grid gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className={labelClassName} required={required}>
          Location
        </FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs text-ds-primary-600 hover:bg-ds-primary-50 hover:text-ds-primary-700"
          onClick={() => void handleUseLocation()}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          )}
          Use location
        </Button>
      </div>
      <Input
        value={value}
        placeholder={placeholder}
        className={formControlFieldGapClass}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <FormFieldError message={error} />
    </div>
  );
}
