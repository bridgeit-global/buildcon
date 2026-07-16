'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormFieldError } from '@/components/ui/form-field-error';
import { FieldLabel } from '@/components/ui/field-label';
import { formControlFieldGapClass, formControlInvalidClass } from '@/components/ui/form-control';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ageFromDobIso,
  daysInMonth,
  dobMonthOptions,
  dobPartsFromIso,
  dobYearOptions,
  isoFromDobParts,
  isValidDobIso,
  latestDobIsoForMinAge,
  todayIsoDate
} from '@/lib/date-input-value';
import { formatDisplayDate } from '@/lib/format-display-date';
import { cn } from '@/lib/utils';

type Props = {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  error?: string;
  className?: string;
  /** When set, only dates yielding this completed age or older can be picked. */
  minAge?: number;
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function defaultViewYear(parts: ReturnType<typeof dobPartsFromIso>, minAge?: number) {
  if (parts.year) return Number(parts.year);
  const now = new Date();
  if (minAge != null) return now.getFullYear() - minAge - 10;
  return now.getFullYear() - 30;
}

export function DobInputField({
  label = 'Date of birth',
  required,
  value,
  onChange,
  onBlur,
  error,
  className,
  minAge
}: Props) {
  const parts = useMemo(() => dobPartsFromIso(value), [value]);
  const age = useMemo(() => ageFromDobIso(value), [value]);
  const valid = useMemo(() => isValidDobIso(value), [value]);
  const meetsMinAge = minAge == null || (age != null && age >= minAge);
  const months = useMemo(() => dobMonthOptions(), []);
  const years = useMemo(() => dobYearOptions(), []);
  const todayIso = useMemo(() => todayIsoDate(), []);
  const maxPickableIso = useMemo(
    () => (minAge != null ? latestDobIsoForMinAge(minAge) : todayIso),
    [minAge, todayIso]
  );

  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(defaultViewYear(parts, minAge));
  const [viewMonth, setViewMonth] = useState(
    parts.month ? Number(parts.month) : now.getMonth() + 1
  );

  useEffect(() => {
    if (!open) return;
    setViewYear(defaultViewYear(parts, minAge));
    if (parts.month) setViewMonth(Number(parts.month));
  }, [open, parts, minAge]);

  const grid = useMemo(() => {
    const leading = new Date(viewYear, viewMonth - 1, 1).getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= total; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function selectDay(day: number) {
    const iso = isoFromDobParts({
      day: pad2(day),
      month: pad2(viewMonth),
      year: String(viewYear)
    });
    onChange(iso);
    onBlur?.();
    setOpen(false);
  }

  function isDayDisabled(iso: string) {
    if (iso > todayIso) return true;
    if (minAge != null && iso > maxPickableIso) return true;
    return false;
  }

  const selectedIso = valid ? value.slice(0, 10) : '';

  return (
    <div className={cn('space-y-1', className)}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-invalid={error ? true : undefined}
            aria-label={label}
            className={cn(
              formControlFieldGapClass,
              'w-full justify-start gap-2 font-normal',
              !valid && 'text-ds-gray-500',
              error ? formControlInvalidClass : undefined
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-ds-gray-500" />
            <span className="min-w-0 truncate">
              {valid ? formatDisplayDate(selectedIso) : 'Pick date of birth'}
            </span>
            {valid && age != null ? (
              <span
                className={cn(
                  'ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold',
                  meetsMinAge
                    ? 'bg-ds-primary-100 text-ds-primary-700'
                    : 'bg-ds-error-100 text-ds-error-700'
                )}
                aria-hidden
              >
                {age}y
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(calc(100vw-2rem),20rem)] p-3" align="start">
          {minAge != null ? (
            <p className="mb-2 text-xs text-ds-gray-500">
              Select a date of birth for age {minAge}+
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex flex-1 items-center gap-2">
              <Select
                value={String(viewMonth)}
                onValueChange={(m) => setViewMonth(Number(m))}
              >
                <SelectTrigger className="h-8 flex-1" aria-label="Month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={String(Number(m.value))}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(viewYear)}
                onValueChange={(y) => setViewYear(Number(y))}
              >
                <SelectTrigger className="h-8 w-24" aria-label="Year">
                  <SelectValue />
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1 text-xs font-medium text-ds-gray-400">
                {w}
              </div>
            ))}
            {grid.map((day, idx) => {
              if (day == null) return <div key={`empty-${idx}`} />;
              const iso = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
              const disabled = isDayDisabled(iso);
              const isSelected = iso === selectedIso;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-md text-sm transition-colors',
                    'hover:bg-ds-primary-50 hover:text-ds-primary-700',
                    'disabled:pointer-events-none disabled:opacity-40',
                    isSelected
                      ? 'bg-ds-primary-500 font-medium text-white hover:bg-ds-primary-500 hover:text-white'
                      : 'text-ds-gray-700'
                  )}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {valid ? (
        <p className="text-xs" aria-live="polite">
          <span className="text-ds-gray-500">Date: {formatDisplayDate(selectedIso)}</span>
          {age != null ? (
            <>
              {' · '}
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold',
                  meetsMinAge
                    ? 'bg-ds-primary-100 text-ds-primary-700'
                    : 'bg-ds-error-100 text-ds-error-700'
                )}
              >
                Age: {age} {age === 1 ? 'year' : 'years'}
              </span>
              {minAge != null && !meetsMinAge ? (
                <span className="ml-1 text-ds-error-600">(must be {minAge}+)</span>
              ) : null}
            </>
          ) : null}
        </p>
      ) : minAge != null ? (
        <p className="text-xs text-ds-gray-500">Nominee must be at least {minAge} years old.</p>
      ) : null}
      <FormFieldError message={error} />
    </div>
  );
}
