'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  FormFieldError,
  RhfTextInput
} from '@/app/crm/customers/customer-form-ui';
import {
  bankFormSchema,
  type BankFormValues
} from '@/lib/customer/customer-forms.schema';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  editing: boolean;
  defaultValues: BankFormValues;
  onSubmit: (values: BankFormValues) => void | Promise<void>;
};

export function CustomerBankDialog({
  open,
  onOpenChange,
  saving,
  editing,
  defaultValues,
  onSubmit
}: Props) {
  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
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
              {editing ? 'Edit bank details' : 'Add bank details'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <RhfTextInput
              control={control}
              name="bank_name"
              label="Bank name"
              placeholder="Bank name"
              className="col-span-2"
            />
            <div className="col-span-2">
              <Label>Account number</Label>
              <Input className="mt-1" {...register('account_no')} />
            </div>
            <div>
              <Label>IFSC</Label>
              <Controller
                control={control}
                name="ifsc"
                render={({ field, fieldState }) => (
                  <>
                    <Input
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                      onBlur={field.onBlur}
                      placeholder="IFSC code"
                      className="mt-1 uppercase"
                      aria-invalid={fieldState.error ? true : undefined}
                    />
                    <FormFieldError message={fieldState.error?.message} />
                  </>
                )}
              />
            </div>
            <div>
              <Label>Branch</Label>
              <Input className="mt-1" {...register('branch')} />
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
