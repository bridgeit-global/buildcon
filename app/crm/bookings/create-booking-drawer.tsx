'use client';

import type { ReactNode } from 'react';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';

export function CreateBookingDrawer({
  open,
  onOpenChange,
  saving,
  onCancel,
  onSubmit,
  submitDisabled,
  submitLabel = 'Create booking & continue',
  banner,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create booking"
      description="Select a blocked unit held for a lead — customer comes from the linked enquiry. Add optional co-buyers below."
      size="lg"
      footer={
        <FormActions
          onCancel={onCancel}
          submitLabel={submitLabel}
          saving={saving}
          submitType="button"
          onSubmitClick={onSubmit}
          disabled={submitDisabled}
        />
      }
    >
      <div className="space-y-6">
        {banner}
        {children}
      </div>
    </FormDrawer>
  );
}
