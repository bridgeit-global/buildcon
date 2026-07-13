'use client';

import { Loader2, MapPin } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { Input } from '@/components/ui/input';
import { formControlFieldGapClass } from '@/components/ui/form-control';
import { useLocationSearch } from '@/lib/address/use-location-search';
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
  placeholder = 'Search city or area, e.g. Pune'
}: ProjectLocationFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { results, loading, minQueryLength } = useLocationSearch(value);

  const trimmed = value.trim();
  const showSuggestions =
    open &&
    !disabled &&
    trimmed.length >= minQueryLength &&
    (loading || results.length > 0);

  function closeSuggestions() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function selectLocation(location: string) {
    onChange(location);
    closeSuggestions();
    onBlur?.();
  }

  function handleInputChange(next: string) {
    onChange(next);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const picked = results[activeIndex];
      if (picked) selectLocation(picked.location);
      return;
    }
    if (e.key === 'Escape') {
      closeSuggestions();
    }
  }

  return (
    <div ref={rootRef} className={cn('grid gap-1', className)}>
      <FieldLabel className={labelClassName} required={required}>
        Location
      </FieldLabel>
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder}
          className={cn(formControlFieldGapClass, 'pr-9')}
          aria-invalid={error ? true : undefined}
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={
            showSuggestions && activeIndex >= 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          role="combobox"
          disabled={disabled}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            const next = e.relatedTarget;
            if (next && rootRef.current?.contains(next)) return;
            closeSuggestions();
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ds-gray-400">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <MapPin className="h-4 w-4" aria-hidden />
          )}
        </div>

        {showSuggestions ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-ds-gray-200 bg-card py-1 shadow-md"
          >
            {loading && results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ds-gray-500">Searching…</li>
            ) : null}
            {!loading && results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ds-gray-500">
                No locations found. Try a different search or type manually.
              </li>
            ) : null}
            {results.map((row, index) => {
              const active = index === activeIndex;
              return (
                <li key={`${row.location}-${row.label}`} role="presentation">
                  <button
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'bg-ds-primary-50 text-ds-gray-900'
                        : 'text-ds-gray-700 hover:bg-ds-gray-50'
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectLocation(row.location)}
                  >
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0 text-ds-primary-500"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.location}</span>
                      {row.label !== row.location ? (
                        <span className="block truncate text-xs text-ds-gray-500">
                          {row.label}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <p className="text-[10px] text-ds-gray-500">
        Type to search places in India, then pick a result or enter manually.
      </p>
      <FormFieldError message={error} />
    </div>
  );
}
