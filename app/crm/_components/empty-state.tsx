import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <div className="text-base font-semibold text-foreground">{title}</div>
      {description ? (
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      ) : null}
      {actionLabel && actionHref ? (
        <div className="mt-5 flex justify-center">
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

