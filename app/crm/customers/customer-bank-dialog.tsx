'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { FormActions } from '@/components/ui/form-actions';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormRow } from '@/components/ui/form-row';
import { FormSection } from '@/components/ui/form-section';
import { RhfTextInput } from '@/app/crm/customers/customer-form-ui';
import { TextInputField } from '@/components/ui/text-input-field';
import {
  bankFormSchema,
  type BankFormValues
} from '@/lib/customer/customer-forms.schema';

const FORM_ID = 'customer-bank-form';

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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit bank details' : 'Add bank details'}
      description="Bank account information for payouts and refunds."
      footer={
        <FormActions
          formId={FORM_ID}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save bank details"
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
        <FormSection title="Bank account">
          <FormRow>
            <RhfTextInput
              control={control}
              name="bank_name"
              label="Bank name"
              placeholder="Bank name"
              className="md:col-span-2"
            />
            <TextInputField
              className="md:col-span-2"
              label="Account number"
              {...register('account_no')}
            />
            <Controller
              control={control}
              name="ifsc"
              render={({ field, fieldState }) => (
                <TextInputField
                  label="IFSC"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  onBlur={field.onBlur}
                  placeholder="IFSC code"
                  inputClassName="uppercase"
                  error={fieldState.error?.message}
                />
              )}
            />
            <TextInputField label="Branch" {...register('branch')} />
          </FormRow>
        </FormSection>
      </form>
    </FormDialog>
  );
}
