'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';
import { CustomerProfileFields } from '@/app/crm/customers/customer-form-ui';
import {
  customerEditSchema,
  customerEditValuesFromCustomer,
  type CustomerEditFormValues
} from '@/lib/customer/customer-forms.schema';

const FORM_ID = 'customer-edit-form';

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
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Edit customer"
      description="Update profile and identity details for this customer."
      size="lg"
      footer={
        <FormActions
          formId={FORM_ID}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save changes"
          saving={saving}
        />
      }
    >
      <form
        id={FORM_ID}
        onSubmit={handleSubmit(
          async (values) => {
            await onSubmit(values);
          },
          () => pageError('Fix the highlighted fields before saving.')
        )}
        className="space-y-6"
      >
        <CustomerProfileFields control={control} showKyc />
      </form>
    </FormDrawer>
  );
}
