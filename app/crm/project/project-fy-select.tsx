'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { projectFyOptions } from '@/lib/project/project-fy';
import { cn } from '@/lib/utils';

type ProjectFySelectProps = {
  projectType: string;
  value: string;
  onValueChange: (fy: string) => void;
  disabled?: boolean;
  label?: string;
  labelClassName?: string;
  className?: string;
  id?: string;
};

export function ProjectFySelect({
  projectType,
  value,
  onValueChange,
  disabled,
  label,
  labelClassName,
  className,
  id
}: ProjectFySelectProps) {
  const options = useMemo(
    () => projectFyOptions(projectType, { includeFy: value }),
    [projectType, value]
  );

  return (
    <div className={cn('grid gap-1', className)}>
      {label ? (
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
      ) : null}
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={cn(label ? 'mt-1' : '', 'w-full')}>
          <SelectValue placeholder="Select FY" />
        </SelectTrigger>
        <SelectContent>
          {options.map((fy) => (
            <SelectItem key={fy} value={fy}>
              {fy}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
