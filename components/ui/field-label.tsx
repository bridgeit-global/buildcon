import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
import { cn } from '@/lib/utils';

export function FieldLabel({
  children,
  className,
  required,
  htmlFor
}: {
  children: ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className={cn(className)}>
      {children}
      {required ? <RequiredMark /> : null}
    </Label>
  );
}
