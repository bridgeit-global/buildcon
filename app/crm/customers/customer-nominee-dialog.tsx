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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  nomineeFormSchema,
  type NomineeFormValues
} from '@/lib/customer/customer-forms.schema';

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

  const { control, handleSubmit, reset, register } = form;

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
            <div className="col-span-2">
              <Label>Relationship</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Spouse, Father"
                {...register('relationship')}
              />
            </div>
            <div className="col-span-2">
              <Label>Date of birth</Label>
              <Controller
                control={control}
                name="nominee_dob"
                render={({ field }) => (
                  <Input type="date" className="mt-1" {...field} />
                )}
              />
            </div>
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
