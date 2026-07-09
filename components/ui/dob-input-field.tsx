'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormFieldError } from '@/components/ui/form-field-error';
import { FieldLabel } from '@/components/ui/field-label';
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
  todayIsoDate
} from '@/lib/date-input-value';
import { formatDisplayDate } from '@/lib/format-display-date';
import { cn } from '@/lib/utils';

type Props = {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  className?: string;
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function DobInputField({
  label = 'Date of birth',
  required,
  value,
  onChange,
  error,
  className
}: Props) {
  const parts = useMemo(() => dobPartsFromIso(value), [value]);
  const age = useMemo(() => ageFromDobIso(value), [value]);
  const valid = useMemo(() => isValidDobIso(value), [value]);
  const months = useMemo(() => dobMonthOptions(), []);
  const years = useMemo(() => dobYearOptions(), []);
  const todayIso = useMemo(() => todayIsoDate(), []);

  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parts.year ? Number(parts.year) : now.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    parts.month ? Number(parts.month) : now.getMonth() + 1
  );

  useEffect(() => {
    if (!open) return;
    if (parts.year) setViewYear(Number(parts.year));
    if (parts.month) setViewMonth(Number(parts.month));
  }, [open, parts.year, parts.month]);

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
    setOpen(false);
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
              'w-full justify-start gap-2 font-normal',
              !valid && 'text-ds-gray-500'
            )}
          >
            <CalendarIcon className="size-4 text-ds-gray-500" />
            {valid ? formatDisplayDate(selectedIso) : 'Pick date of birth'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
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
              const disabled = iso > todayIso;
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
        <p className="text-xs text-ds-gray-500" aria-live="polite">
          Date: {formatDisplayDate(selectedIso)}
          {age != null ? (
            <>
              {' · '}Age: {age} {age === 1 ? 'year' : 'years'}
            </>
          ) : null}
        </p>
      ) : null}
      <FormFieldError message={error} />
    </div>
  );
}
