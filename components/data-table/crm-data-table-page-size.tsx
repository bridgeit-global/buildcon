'use client';

import type { Table } from '@tanstack/react-table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const CRM_DATA_TABLE_PAGE_SIZES = [10, 15, 25, 50] as const;

type CrmDataTablePageSizeProps<TData> = {
  table: Table<TData>;
  options?: readonly number[];
  className?: string;
};

export function CrmDataTablePageSize<TData>({
  table,
  options = CRM_DATA_TABLE_PAGE_SIZES,
  className
}: CrmDataTablePageSizeProps<TData>) {
  return (
    <div className={cn('min-w-[7rem]', className)}>
      <Label className="text-xs text-muted-foreground">Rows per page</Label>
      <Select
        value={String(table.getState().pagination.pageSize)}
        onValueChange={(v) => table.setPageSize(Number(v))}
      >
        <SelectTrigger className="mt-1 h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
