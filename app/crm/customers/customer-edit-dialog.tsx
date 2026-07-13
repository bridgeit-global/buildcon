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
import {
  CUSTOMER_FORM_DIALOG_CLASS,
  CustomerProfileFields
} from '@/app/crm/customers/customer-form-ui';
import {
  customerEditSchema,
  customerEditValuesFromCustomer,
  type CustomerEditFormValues
} from '@/lib/customer/customer-forms.schema';

type CustomerSource = Parameters<typeof customerEditValuesFromCustomer>[0];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  customer: CustomerSource | null;
  onSubmit: (values: CustomerEditFormValues) => void | Promise<void>;
};

export function CustomerEditDialog({
  open,
  onOpenChange,
  saving,
  customer,
  onSubmit
}: Props) {
  const form = useForm<CustomerEditFormValues>({
    resolver: zodResolver(customerEditSchema),
    defaultValues: customerEditValuesFromCustomer(
      customer ?? {
        first_name: '',
        middle_name: '',
        last_name: '',
        full_name: '',
        phone: null,
        email: null,
        dob: null,
        occupation: null,
        nationality: null,
        pan_number: null,
        aadhaar_last4: null,
        guardian_name: null,
        residential_status: null,
        passport_number: null,
        office_name_address: null
      }
    ),
    mode: 'onChange'
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (open && customer) {
      reset(customerEditValuesFromCustomer(customer));
    }
  }, [open, customer, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CUSTOMER_FORM_DIALOG_CLASS}>
        <form
          onSubmit={handleSubmit(
            async (values) => {
              await onSubmit(values);
            },
            () => pageError('Fix the highlighted fields before saving.')
          )}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <CustomerProfileFields control={control} showKyc />
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
