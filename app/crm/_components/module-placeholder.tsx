import { Card } from '@/components/ui/card';

export function ModulePlaceholder({
  title,
  description
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="p-6">
      <div className="text-base font-semibold text-gray-900">{title}</div>
      {description ? (
        <div className="mt-1 text-sm text-gray-500">{description}</div>
      ) : null}
    </Card>
  );
}

