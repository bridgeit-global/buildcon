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
    <div className="rounded-xl border bg-white p-8 text-center">
      <div className="text-base font-semibold text-gray-900">{title}</div>
      {description ? (
        <div className="mt-1 text-sm text-gray-500">{description}</div>
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

