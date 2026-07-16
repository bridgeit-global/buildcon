'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { FormActions } from '@/components/ui/form-actions';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormRow } from '@/components/ui/form-row';
import { FormSection } from '@/components/ui/form-section';
import { RhfTextInput } from '@/app/crm/customers/customer-form-ui';
import { DateInputField } from '@/components/ui/date-input-field';
import { TextInputField } from '@/components/ui/text-input-field';
import {
  nomineeFormSchema,
  type NomineeFormValues
} from '@/lib/customer/customer-forms.schema';
import { todayIsoDate } from '@/lib/date-input-value';

const FORM_ID = 'customer-nominee-form';

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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit nominee' : 'Add nominee'}
      description="Nominee details for legal and financial records."
      footer={
        <FormActions
          formId={FORM_ID}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save nominee"
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
        <FormSection title="Nominee details">
          <FormRow>
            <RhfTextInput
              control={control}
              name="nominee_name"
              label="Full name"
              placeholder="Nominee name"
              className="md:col-span-2"
            />
            <Controller
              control={control}
              name="relationship"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="md:col-span-2"
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
                <DateInputField
                  className="md:col-span-2"
                  label="Date of birth"
                  max={todayIsoDate()}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  placeholder="Select date of birth"
                />
              )}
            />
          </FormRow>
        </FormSection>
      </form>
    </FormDialog>
  );
}
