'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import {
  kycIdentitySchema,
  kycIdentityValuesFromCustomer,
  type KycIdentityFormValues
} from '@/lib/customer/customer-forms.schema';

type Props = {
  customer: {
    pan_number: string | null;
    aadhaar_last4: string | null;
  } | null;
  saving: boolean;
  onSubmit: (values: KycIdentityFormValues) => void | Promise<void>;
};

export function CustomerKycIdentityForm({
  customer,
  saving,
  onSubmit
}: Props) {
  const form = useForm<KycIdentityFormValues>({
    resolver: zodResolver(kycIdentitySchema),
    defaultValues: kycIdentityValuesFromCustomer(
      customer ?? { pan_number: null, aadhaar_last4: null }
    ),
    mode: 'onTouched',
    reValidateMode: 'onBlur'
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (customer) reset(kycIdentityValuesFromCustomer(customer));
  }, [customer?.pan_number, customer?.aadhaar_last4, customer, reset]);

  return (
    <form
      onSubmit={handleSubmit(
        async (values) => onSubmit(values),
        () => pageError('Fix the highlighted fields before saving.')
      )}
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="pan_number"
          render={({ field, fieldState }) => (
            <PanInputField
              value={field.value}
              onChange={field.onChange}
              required
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="aadhaar_last4"
          render={({ field, fieldState }) => (
            <AadhaarInputField
              value={field.value}
              onChange={field.onChange}
              required
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
      <Button type="submit" size="sm" className="mt-3" disabled={saving}>
        {saving ? 'Saving…' : 'Save to customer'}
      </Button>
    </form>
  );
}
