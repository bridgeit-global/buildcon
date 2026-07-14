'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FormActions({
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  saving = false,
  formId,
  disabled = false,
  className,
  submitType = 'submit',
  onSubmitClick
}: {
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  saving?: boolean;
  formId?: string;
  disabled?: boolean;
  className?: string;
  submitType?: 'submit' | 'button';
  onSubmitClick?: () => void;
}) {
  return (
    <div className={cn('flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving || disabled}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        type={submitType}
        form={submitType === 'submit' ? formId : undefined}
        disabled={saving || disabled}
        onClick={submitType === 'button' ? onSubmitClick : undefined}
      >
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Saving…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  );
}
