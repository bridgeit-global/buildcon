'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formControlTriggerClass, formControlInvalidClass } from '@/components/ui/form-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  className,
  disabled,
  error
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  React.useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            formControlTriggerClass,
            'rounded-md border border-input bg-transparent shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-0.5',
            !value && 'text-muted-foreground',
            error ? formControlInvalidClass : undefined,
            className
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{value || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
        align="start"
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onValueChange(option === value ? '' : option);
                setOpen(false);
              }}
              className={cn(
                'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground',
                option === value && 'bg-accent text-accent-foreground'
              )}
            >
              {option}
              {option === value && (
                <Check className="absolute right-2 h-4 w-4" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
