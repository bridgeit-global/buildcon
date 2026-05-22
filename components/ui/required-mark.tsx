import { cn } from '@/lib/utils';

export function RequiredMark({ className }: { className?: string }) {
  return (
    <span className={cn('ml-0.5 text-ds-error-600', className)} aria-hidden="true">
      *
    </span>
  );
}
