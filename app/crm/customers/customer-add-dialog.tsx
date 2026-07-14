'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';
import { CustomerProfileFields } from '@/app/crm/customers/customer-form-ui';
import {
  customerCreateSchema,
  EMPTY_CUSTOMER_CREATE,
  type CustomerCreateFormValues
} from '@/lib/customer/customer-forms.schema';

const FORM_ID = 'customer-add-form';

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
    <>
      <Button size="sm" onClick={() => onOpenChange(true)}>
        Add
      </Button>
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Add customer"
        description="Create a new customer record with contact details and address."
        size="lg"
        footer={
          <FormActions
            formId={FORM_ID}
            onCancel={() => onOpenChange(false)}
            submitLabel="Save customer"
            saving={saving}
          />
        }
      >
        <form
          id={FORM_ID}
          onSubmit={handleSubmit(
            async (values) => onSubmit(values),
            () => pageError('Fix the highlighted fields before saving.')
          )}
          className="space-y-6"
        >
          <CustomerProfileFields control={control} showAddress />
        </form>
      </FormDrawer>
    </>
  );
}
