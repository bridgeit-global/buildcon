import { Card } from '@/components/ui/card';

export function PortalPlaceholder({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </Card>
  );
}
