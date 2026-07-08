'use client';

import * as React from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

type MultiSearchableSelectProps = {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  /** Allow adding a typed value that is not in `options`. */
  allowCustom?: boolean;
};

export function MultiSearchableSelect({
  values,
  onValuesChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  className,
  disabled,
  allowCustom = false
}: MultiSearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const trimmedSearch = search.trim();

  const filtered = React.useMemo(() => {
    if (!trimmedSearch) return options;
    const q = trimmedSearch.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, trimmedSearch]);

  const canAddCustom =
    allowCustom &&
    trimmedSearch.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmedSearch.toLowerCase()) &&
    !values.some((v) => v.toLowerCase() === trimmedSearch.toLowerCase());

  React.useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const toggle = (option: string) => {
    if (values.includes(option)) {
      onValuesChange(values.filter((v) => v !== option));
    } else {
      onValuesChange([...values, option]);
    }
  };

  const addCustom = () => {
    if (!canAddCustom) return;
    onValuesChange([...values, trimmedSearch]);
    setSearch('');
  };

  const removeValue = (option: string) => {
    onValuesChange(values.filter((v) => v !== option));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          {values.length > 0 ? (
            <span className="flex flex-1 flex-wrap gap-1">
              {values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-md border border-ds-primary-200 bg-ds-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-ds-primary-700"
                >
                  {v}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${v}`}
                    className="rounded-sm hover:text-ds-primary-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeValue(v);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddCustom) {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={searchPlaceholder}
            className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {canAddCustom && (
            <button
              type="button"
              onClick={addCustom}
              className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-4 w-4 shrink-0 opacity-70" />
              Add “{trimmedSearch}”
            </button>
          )}
          {filtered.length === 0 && !canAddCustom && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}
          {filtered.map((option) => {
            const selected = values.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={cn(
                  'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground',
                  selected && 'bg-accent text-accent-foreground'
                )}
              >
                {option}
                {selected && <Check className="absolute right-2 h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
