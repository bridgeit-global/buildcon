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
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  CUSTOMER_FORM_DIALOG_CLASS,
  CustomerProfileFields
} from '@/app/crm/customers/customer-form-ui';
import {
  customerCreateSchema,
  EMPTY_CUSTOMER_CREATE,
  type CustomerCreateFormValues
} from '@/lib/customer/customer-forms.schema';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (values: CustomerCreateFormValues) => void | Promise<void>;
};

export function CustomerAddDialog({
  open,
  onOpenChange,
  saving,
  onSubmit
}: Props) {
  const form = useForm<CustomerCreateFormValues>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: EMPTY_CUSTOMER_CREATE,
    mode: 'onChange'
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (!open) reset(EMPTY_CUSTOMER_CREATE);
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add</Button>
      </DialogTrigger>
      <DialogContent className={CUSTOMER_FORM_DIALOG_CLASS}>
        <form
          onSubmit={handleSubmit(
            async (values) => onSubmit(values),
            () => pageError('Fix the highlighted fields before saving.')
          )}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <CustomerProfileFields control={control} showAddress />
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
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
