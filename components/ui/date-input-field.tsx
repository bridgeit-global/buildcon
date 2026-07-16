'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import {
  formControlFieldGapClass,
  formControlInvalidClass
} from '@/components/ui/form-control';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  daysInMonth,
  dobMonthOptions,
  todayIsoDate
} from '@/lib/date-input-value';
import { formatDisplayDate } from '@/lib/format-display-date';
import { cn } from '@/lib/utils';

type Props = {
  id?: string;
  label?: string;
  labelClassName?: string;
  required?: boolean;
  value: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  error?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  helperText?: string;
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isIsoDateString(value: string | null | undefined): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim());
}

function clampYearStart(min: string | undefined) {
  return isIsoDateString(min) ? Number(min.slice(0, 4)) : 1900;
}

function clampYearEnd(max: string | undefined) {
  return isIsoDateString(max) ? Number(max.slice(0, 4)) : Number(todayIsoDate().slice(0, 4)) + 20;
}

function monthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function boundMonthKey(iso: string) {
  return iso.slice(0, 7);
}

function inRange(
  iso: string,
  min: string | undefined,
  max: string | undefined
) {
  if (!isIsoDateString(iso)) return false;
  if (min && isIsoDateString(min) && iso < min) return false;
  if (max && isIsoDateString(max) && iso > max) return false;
  return true;
}

export function DateInputField({
  id,
  label,
  labelClassName,
  required,
  value,
  onChange,
  onBlur,
  error,
  className,
  buttonClassName,
  disabled,
  placeholder = 'Pick a date',
  min,
  max,
  helperText
}: Props) {
  const today = useMemo(() => todayIsoDate(), []);
  const selectedIso = useMemo(
    () => (isIsoDateString(value) && inRange(value, min, max) ? value : ''),
    [value, min, max]
  );
  const displayValue = selectedIso ? formatDisplayDate(selectedIso) : placeholder;
  const months = useMemo(() => dobMonthOptions(), []);
  const years = useMemo(() => {
    const start = clampYearStart(min);
    const end = Math.max(start, clampYearEnd(max));
    const items: number[] = [];
    for (let year = end; year >= start; year -= 1) items.push(year);
    return items;
  }, [min, max]);

  const initialDate = selectedIso
    ? new Date(`${selectedIso}T00:00:00`)
    : new Date(`${today}T00:00:00`);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth() + 1);

  useEffect(() => {
    if (!open) return;
    const nextDate = selectedIso ? new Date(`${selectedIso}T00:00:00`) : new Date(`${today}T00:00:00`);
    setViewYear(nextDate.getFullYear());
    setViewMonth(nextDate.getMonth() + 1);
  }, [open, selectedIso, today]);

  const minMonth = isIsoDateString(min) ? boundMonthKey(min) : null;
  const maxMonth = isIsoDateString(max) ? boundMonthKey(max) : null;
  const currentMonth = monthKey(viewYear, viewMonth);
  const canGoPrev = !disabled && (!minMonth || currentMonth > minMonth);
  const canGoNext = !disabled && (!maxMonth || currentMonth < maxMonth);

  const grid = useMemo(() => {
    const leading = new Date(viewYear, viewMonth - 1, 1).getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    const nextKey = monthKey(year, month);
    if (minMonth && nextKey < minMonth) return;
    if (maxMonth && nextKey > maxMonth) return;
    setViewMonth(month);
    setViewYear(year);
  }

  function selectDay(day: number) {
    const iso = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    if (!inRange(iso, min, max)) return;
    onChange(iso);
    onBlur?.();
    setOpen(false);
  }

  function clearValue() {
    onChange('');
    onBlur?.();
    setOpen(false);
  }

  return (
    <div className={className}>
      {label ? (
        <FieldLabel htmlFor={id} className={labelClassName} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-label={label}
            className={cn(
              label ? formControlFieldGapClass : undefined,
              'w-full justify-start gap-2 font-normal',
              !selectedIso && 'text-ds-gray-500',
              error ? formControlInvalidClass : undefined,
              buttonClassName
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-ds-gray-500" />
            <span className="min-w-0 truncate">{displayValue}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(calc(100vw-2rem),20rem)] p-3" align="start">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              disabled={!canGoPrev}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex flex-1 items-center gap-2">
              <Select
                value={String(viewMonth)}
                onValueChange={(month) => setViewMonth(Number(month))}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 flex-1" aria-label="Month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem
                      key={month.value}
                      value={String(Number(month.value))}
                    >
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(viewYear)}
                onValueChange={(year) => setViewYear(Number(year))}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 w-24" aria-label="Year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
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
              disabled={!canGoNext}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((weekday) => (
              <div
                key={weekday}
                className="py-1 text-xs font-medium text-ds-gray-400"
              >
                {weekday}
              </div>
            ))}
            {grid.map((day, idx) => {
              if (day == null) return <div key={`empty-${idx}`} />;
              const iso = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
              const isSelected = iso === selectedIso;
              const isDisabled = !inRange(iso, min, max);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isDisabled}
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

          {selectedIso ? (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="min-w-0 text-xs text-ds-gray-500">
                Selected: {formatDisplayDate(selectedIso)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1 px-2 text-ds-gray-600"
                onClick={clearValue}
                disabled={disabled || required}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {helperText ? (
        <p className="mt-1 text-xs text-ds-gray-500">{helperText}</p>
      ) : null}
      <FormFieldError message={error} />
    </div>
  );
}
