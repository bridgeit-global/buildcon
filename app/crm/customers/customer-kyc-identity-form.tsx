'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
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
    mode: 'onChange'
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
        <div>
          <Label>PAN</Label>
          <Controller
            control={control}
            name="pan_number"
            render={({ field, fieldState }) => (
              <>
                <Input
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  onBlur={field.onBlur}
                  placeholder="ABCDE1234F"
                  className="mt-1 uppercase"
                  aria-invalid={fieldState.error ? true : undefined}
                />
                <FormFieldError message={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div>
          <Label>Aadhaar number</Label>
          <Controller
            control={control}
            name="aadhaar_last4"
            render={({ field, fieldState }) => (
              <>
                <Input
                  value={field.value}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value.replace(/\D/g, '').slice(0, 12)
                    )
                  }
                  onBlur={field.onBlur}
                  maxLength={12}
                  inputMode="numeric"
                  placeholder="123456789012"
                  className="mt-1"
                  aria-invalid={fieldState.error ? true : undefined}
                />
                <FormFieldError message={fieldState.error?.message} />
              </>
            )}
          />
        </div>
      </div>
      <Button type="submit" size="sm" className="mt-3" disabled={saving}>
        {saving ? 'Saving…' : 'Save to customer'}
      </Button>
    </form>
  );
}
