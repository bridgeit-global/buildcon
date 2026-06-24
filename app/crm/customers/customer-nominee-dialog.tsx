'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { RhfTextInput } from '@/app/crm/customers/customer-form-ui';
import { Controller } from 'react-hook-form';
import { TextInputField } from '@/components/ui/text-input-field';
import {
  nomineeFormSchema,
  type NomineeFormValues
} from '@/lib/customer/customer-forms.schema';
import { todayIsoDate } from '@/lib/date-input-value';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  editing: boolean;
  defaultValues: NomineeFormValues;
  onSubmit: (values: NomineeFormValues) => void | Promise<void>;
};

export function CustomerNomineeDialog({
  open,
  onOpenChange,
  saving,
  editing,
  defaultValues,
  onSubmit
}: Props) {
  const form = useForm<NomineeFormValues>({
    resolver: zodResolver(nomineeFormSchema),
    defaultValues,
    mode: 'onChange'
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, defaultValues, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form
          onSubmit={handleSubmit(
            async (values) => onSubmit(values),
            () => pageError('Fix the highlighted fields before saving.')
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit nominee' : 'Add nominee'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <RhfTextInput
              control={control}
              name="nominee_name"
              label="Full name"
              placeholder="Nominee name"
              className="col-span-2"
            />
            <Controller
              control={control}
              name="relationship"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="col-span-2"
                  label="Relationship"
                  placeholder="e.g. Spouse, Father"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="nominee_dob"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="col-span-2"
                  label="Date of birth"
                  type="date"
                  max={todayIsoDate()}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
