'use client';

import { CrmSkeletonBar } from '@/app/crm/_components/crm-skeletons';
import { cn } from '@/lib/utils';

type CrmDataTableRowCountProps = {
  count: number;
  noun: string;
  filtered?: boolean;
  loading?: boolean;
  className?: string;
};

export function CrmDataTableRowCount({
  count,
  noun,
  filtered = false,
  loading = false,
  className
}: CrmDataTableRowCountProps) {
  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      {loading ? (
        <CrmSkeletonBar className="inline-block w-16" />
      ) : (
        <>
          {count} {noun}
          {count !== 1 ? 's' : ''}
          {filtered ? ' (filtered)' : ''}
        </>
      )}
    </div>
  );
}
