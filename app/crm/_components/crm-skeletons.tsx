import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function CrmSkeletonBar({
  className,
  ...props
}: React.ComponentProps<typeof Skeleton>) {
  return <Skeleton className={cn('h-3', className)} {...props} />;
}

export function CrmPageContentSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Card className="gap-0 overflow-hidden rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="mt-4 space-y-2 rounded-lg border border-ds-gray-200 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function CrmKpiGridSkeleton({
  count = 4,
  cols = 4
}: {
  count?: number;
  cols?: 2 | 3 | 4;
}) {
  const gridClass =
    cols === 2
      ? 'grid grid-cols-2 gap-3'
      : cols === 3
        ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-4';

  return (
    <section className={gridClass} aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={i}
          className="gap-0 rounded-xl border-ds-gray-200 p-4 shadow-sm"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-32" />
        </Card>
      ))}
    </section>
  );
}

export function CrmChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-[220px] flex-col justify-end gap-2 px-2', className)}
      aria-busy="true"
      aria-label="Loading chart"
    >
      <div className="flex h-full items-end justify-between gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full max-w-8"
            style={{ height: `${40 + (i % 4) * 28}px` }}
          />
        ))}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function CrmTableBodySkeleton({
  colSpan,
  rows = 8
}: {
  colSpan: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-ds-gray-100 last:border-0">
          <td colSpan={colSpan} className="px-4 py-3">
            <Skeleton className="h-5 w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function CrmTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card
      className="gap-0 overflow-hidden rounded-xl border-ds-gray-200 p-4 shadow-sm"
      aria-busy="true"
      aria-label="Loading table"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-9 w-full max-w-sm" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-ds-gray-200">
        <div className="border-b border-ds-gray-100 bg-ds-gray-50/80 px-4 py-3">
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="divide-y divide-ds-gray-100">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function CrmDetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading details">
      <Card className="gap-0 rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
          ))}
        </div>
      </Card>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="gap-0 rounded-xl border-ds-gray-200 p-4 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CrmFormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <Card
      className="gap-0 rounded-xl border-ds-gray-200 p-4 shadow-sm"
      aria-busy="true"
      aria-label="Loading form"
    >
      <Skeleton className="h-5 w-44" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </Card>
  );
}

const INVENTORY_SURFACE_CLASS =
  'rounded-lg border border-ds-gray-200 bg-white shadow-sm';

export function CrmInventoryKvRowSkeleton() {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-28 max-w-[60%]" />
    </div>
  );
}

export function CrmInventoryGridMatrixSkeleton({
  floors = 5,
  unitsPerFloor = 4
}: {
  floors?: number;
  unitsPerFloor?: number;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <Skeleton className="mb-2 inline-block h-6 w-20 rounded bg-ds-primary-50/80" />
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="w-16 px-2 py-0.5 text-left">
              <Skeleton className="h-2.5 w-8" />
            </th>
            {Array.from({ length: unitsPerFloor }).map((_, i) => (
              <th key={i} className="px-2 py-0.5 text-center">
                <Skeleton className="mx-auto h-2.5 w-10" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: floors }).map((_, row) => (
            <tr key={row}>
              <td className="px-2 py-1 align-middle">
                <Skeleton className="h-3 w-6" />
              </td>
              {Array.from({ length: unitsPerFloor }).map((_, col) => (
                <td
                  key={col}
                  className="px-1 py-1 text-center align-middle"
                >
                  <Skeleton className="inline-block h-[76px] w-[76px] rounded-lg" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrmInventoryPageSkeleton() {
  const tabWidths = ['w-14', 'w-14', 'w-24', 'w-16', 'w-20', 'w-20'] as const;

  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading inventory"
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          INVENTORY_SURFACE_CLASS
        )}
      >
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="min-w-[12rem] max-w-[min(100%,320px)]">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-1 h-9 w-full min-w-[12rem]" />
        </div>
      </div>

      <div className={cn('flex flex-wrap gap-0 rounded-lg px-4', INVENTORY_SURFACE_CLASS)}>
        {tabWidths.map((w, i) => (
          <div key={i} className="border-b-2 border-transparent px-3.5 py-3">
            <Skeleton className={cn('h-3', w)} />
          </div>
        ))}
      </div>

      <Skeleton className="h-9 w-full rounded-md" />

      <div
        className={cn(
          'flex flex-wrap items-end gap-3 px-4 py-3',
          INVENTORY_SURFACE_CLASS
        )}
      >
        <div className="min-w-[10rem] max-w-[220px]">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="mt-1 h-9 w-full min-w-[10rem]" />
        </div>
        <div className="min-w-[10rem]">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="mt-1 h-9 w-full min-w-[10rem]" />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-[4.5rem]" />
          ))}
        </div>
      </div>

      <div
        className={cn(
          'min-w-0 flex-1 overflow-x-auto p-4',
          INVENTORY_SURFACE_CLASS
        )}
      >
        <CrmInventoryGridMatrixSkeleton floors={6} unitsPerFloor={5} />
        <CrmInventoryGridMatrixSkeleton floors={4} unitsPerFloor={4} />
      </div>
    </div>
  );
}
