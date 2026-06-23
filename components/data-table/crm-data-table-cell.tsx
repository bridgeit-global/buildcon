'use client';

import { flexRender, type Cell } from '@tanstack/react-table';
import { cn } from '@/lib/utils';

type CrmDataTableCellProps<TData> = {
  cell: Cell<TData, unknown>;
  className?: string;
};

export function CrmDataTableCell<TData>({ cell, className }: CrmDataTableCellProps<TData>) {
  return (
    <td className={cn('px-4 py-3', className)} style={{ width: cell.column.getSize() }}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  );
}
