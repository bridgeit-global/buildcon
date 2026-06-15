'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TextInputField } from '@/components/ui/text-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  addressFormSchema,
  EMPTY_ADDRESS,
  type AddressFormValues
} from '@/lib/customer/customer-forms.schema';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';
import { getCitiesForState } from '@/lib/address/indian-state-cities';

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

  const { control, handleSubmit, reset, setValue, watch } = form;

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, defaultValues, reset]);

  const onPincodeResult = useCallback(
    (result: { city: string; state: string }) => {
      setValue('state', result.state, { shouldDirty: true });
      setValue('city', result.city, { shouldDirty: true });
    },
    [setValue]
  );

  const { loading: pincodeLoading, handlePinChange } =
    usePincodeLookup(onPincodeResult);

  const watchedState = watch('state');
  const watchedCity = watch('city');

  const stateOptions = useMemo(() => [...INDIAN_STATES], []);

  const cityOptions = useMemo(() => {
    const list = getCitiesForState(watchedState);
    if (watchedCity && !list.includes(watchedCity)) {
      return [watchedCity, ...list].sort();
    }
    return list;
  }, [watchedState, watchedCity]);

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
            <Controller
              control={control}
              name="address_line1"
              render={({ field, fieldState }) => (
                <TextareaField
                  className="col-span-2"
                  label="Address line"
                  rows={2}
                  placeholder="Street, building, landmark…"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="col-span-2">
              <Controller
                control={control}
                name="pin"
                render={({ field, fieldState }) => (
                  <div className="relative">
                    <TextInputField
                      label="PIN Code"
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
                      error={fieldState.error?.message}
                    />
                    {pincodeLoading && (
                      <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-ds-gray-400" />
                    )}
                  </div>
                )}
              />
            </div>
            <div>
              <Label>State</Label>
              <Controller
                control={control}
                name="state"
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      if (val !== watchedState) setValue('city', '', { shouldDirty: true });
                    }}
                    options={stateOptions}
                    placeholder="Select state"
                    searchPlaceholder="Search state…"
                    className="mt-1"
                  />
                )}
              />
            </div>
            <div>
              <Label>City</Label>
              <Controller
                control={control}
                name="city"
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={cityOptions}
                    placeholder="Select city"
                    searchPlaceholder="Search city…"
                    className="mt-1"
                  />
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
