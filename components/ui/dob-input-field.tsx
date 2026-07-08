'use client';

import { useMemo } from 'react';
import { FormFieldError } from '@/components/ui/form-field-error';
import { FieldLabel } from '@/components/ui/field-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ageFromDobIso,
  dobDayOptions,
  dobMonthOptions,
  dobPartsFromIso,
  dobYearOptions,
  isoFromDobParts,
  type DobParts
} from '@/lib/date-input-value';
import { cn } from '@/lib/utils';

type Props = {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  className?: string;
};

export function DobInputField({
  label = 'Date of birth',
  required,
  value,
  onChange,
  error,
  className
}: Props) {
  const parts = useMemo(() => dobPartsFromIso(value), [value]);
  const years = useMemo(() => dobYearOptions(), []);
  const months = useMemo(() => dobMonthOptions(), []);
  const days = useMemo(
    () => dobDayOptions(parts.year, parts.month),
    [parts.year, parts.month]
  );
  const age = useMemo(() => ageFromDobIso(value), [value]);

  function patch(next: Partial<DobParts>) {
    const merged = { ...parts, ...next };
    if (
      merged.day &&
      merged.month &&
      merged.year &&
      !dobDayOptions(merged.year, merged.month).includes(merged.day)
    ) {
      merged.day = '';
    }
    onChange(isoFromDobParts(merged));
  }

  return (
    <div className={cn('space-y-1', className)}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={parts.day || undefined}
          onValueChange={(day) => patch({ day })}
        >
          <SelectTrigger aria-invalid={error ? true : undefined} aria-label="Day">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={parts.month || undefined}
          onValueChange={(month) => patch({ month })}
        >
          <SelectTrigger aria-invalid={error ? true : undefined} aria-label="Month">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={parts.year || undefined}
          onValueChange={(year) => patch({ year })}
        >
          <SelectTrigger aria-invalid={error ? true : undefined} aria-label="Year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {age != null ? (
        <p className="text-xs text-ds-gray-500" aria-live="polite">
          Age: {age} {age === 1 ? 'year' : 'years'}
        </p>
      ) : null}
      <FormFieldError message={error} />
    </div>
  );
}
