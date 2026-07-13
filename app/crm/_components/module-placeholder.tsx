import { Card } from '@/components/ui/card';

/** Matches build-con-pos dashboard cards: white panel, light shadow, compact type. */
export function ModulePlaceholder({
  title,
  description
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="border-0 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="text-[13px] font-semibold text-foreground">{title}</div>
      {description ? (
        <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      ) : null}
    </Card>
  );
}

