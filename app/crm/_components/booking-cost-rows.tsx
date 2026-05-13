import { cn } from '@/lib/utils';

type BookingCostRowsProps = {
  rows: readonly (readonly [string, string])[];
  /** Inquiry overview uses two columns on wide screens; unit summary uses one. */
  layout?: 'two-column' | 'one-column';
  rowVariant?: 'elevated' | 'muted';
  className?: string;
};

export function BookingCostRows({
  rows,
  layout = 'two-column',
  rowVariant = 'elevated',
  className
}: BookingCostRowsProps) {
  return (
    <dl
      className={cn(
        'grid gap-2',
        layout === 'two-column' ? 'sm:grid-cols-2' : 'sm:grid-cols-1',
        className
      )}
    >
      {rows.map(([label, value], idx) => (
        <div
          key={`${idx}-${label}`}
          className={cn(
            'flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2',
            rowVariant === 'elevated'
              ? 'border-white bg-white shadow-sm'
              : 'border-gray-100 bg-gray-50/80'
          )}
        >
          <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
          <dd className="text-right text-xs font-semibold text-slate-900">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
