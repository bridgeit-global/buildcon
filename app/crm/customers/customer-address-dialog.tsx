'use client';

import { useCallback, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { FormFieldError } from '@/app/crm/customers/customer-form-ui';
import {
  addressFormSchema,
  EMPTY_ADDRESS,
  type AddressFormValues
} from '@/lib/customer/customer-forms.schema';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  editing: boolean;
  defaultValues: AddressFormValues;
  onSubmit: (values: AddressFormValues) => void | Promise<void>;
};

export function CustomerAddressDialog({
  open,
  onOpenChange,
  saving,
  editing,
  defaultValues,
  onSubmit
}: Props) {
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues,
    mode: 'onChange'
  });

  const { control, handleSubmit, reset, register, setValue } = form;

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, defaultValues, reset]);

  const onPincodeResult = useCallback(
    (result: { city: string; state: string }) => {
      setValue('city', result.city, { shouldDirty: true });
      setValue('state', result.state, { shouldDirty: true });
    },
    [setValue]
  );

  const { loading: pincodeLoading, handlePinChange } =
    usePincodeLookup(onPincodeResult);

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
              {editing ? 'Edit address' : 'Add address'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="col-span-2">
              <Label>Address line</Label>
              <Controller
                control={control}
                name="address_line1"
                render={({ field, fieldState }) => (
                  <>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Street, building, landmark…"
                      className="mt-1"
                      aria-invalid={fieldState.error ? true : undefined}
                    />
                    <FormFieldError message={fieldState.error?.message} />
                  </>
                )}
              />
            </div>
            <div className="col-span-2">
              <Label>PIN Code</Label>
              <Controller
                control={control}
                name="pin"
                render={({ field, fieldState }) => (
                  <div className="relative">
                    <Input
                      value={field.value}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        field.onChange(val);
                        handlePinChange(val);
                      }}
                      onBlur={field.onBlur}
                      placeholder="e.g. 400001"
                      inputMode="numeric"
                      maxLength={6}
                      className="mt-1"
                      aria-invalid={fieldState.error ? true : undefined}
                    />
                    {pincodeLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ds-gray-400" />
                    )}
                    <FormFieldError message={fieldState.error?.message} />
                  </div>
                )}
              />
            </div>
            <div>
              <Label>City</Label>
              <Controller
                control={control}
                name="city"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="City / District"
                    className="mt-1"
                  />
                )}
              />
            </div>
            <div>
              <Label>State</Label>
              <Controller
                control={control}
                name="state"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
