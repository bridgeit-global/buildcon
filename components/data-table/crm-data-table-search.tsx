'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type CrmDataTableSearchProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  showIcon?: boolean;
  className?: string;
};

export function CrmDataTableSearch({
  id,
  value,
  onChange,
  placeholder = 'Search…',
  label,
  showIcon = false,
  className
}: CrmDataTableSearchProps) {
  return (
    <div className={cn('relative w-full min-w-[12rem] flex-1 sm:max-w-sm', className)}>
      <Label htmlFor={id} className={label ? 'text-xs text-muted-foreground' : 'sr-only'}>
        {label ?? placeholder}
      </Label>
      {showIcon ? (
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      ) : null}
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(showIcon ? 'pl-9' : undefined, label ? 'mt-1' : undefined)}
      />
    </div>
  );
}
