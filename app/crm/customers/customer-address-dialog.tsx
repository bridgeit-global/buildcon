'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { pageError } from '@/lib/toast';
import { Checkbox } from '@/components/ui/checkbox';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';
import { FormFieldError } from '@/components/ui/form-field-error';
import { FormRow, FormRowFull } from '@/components/ui/form-row';
import { FormSection } from '@/components/ui/form-section';
import { FieldLabel } from '@/components/ui/field-label';
import { TextInputField } from '@/components/ui/text-input-field';
import {
  formControlClass,
  formControlFieldGapClass
} from '@/components/ui/form-control';
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
  type AddressFormValues
} from '@/lib/customer/customer-forms.schema';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';
import { getCitiesForState } from '@/lib/address/indian-state-cities';
import { cn } from '@/lib/utils';

const FORM_ID = 'customer-address-form';

export type CorrespondenceAddress = {
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  editing: boolean;
  defaultValues: AddressFormValues;
  onSubmit: (values: AddressFormValues) => void | Promise<void>;
  correspondenceAddress?: CorrespondenceAddress | null;
};

export function CustomerAddressDialog({
  open,
  onOpenChange,
  saving,
  editing,
  defaultValues,
  onSubmit,
  correspondenceAddress
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
      setValue('state', result.state, { shouldDirty: true, shouldValidate: true });
      setValue('city', result.city, { shouldDirty: true });
    },
    [setValue]
  );

  const { loading: pincodeLoading, handlePinChange } =
    usePincodeLookup(onPincodeResult);

  const watchedKind = watch('kind');
  const watchedState = watch('state');
  const watchedCity = watch('city');
  const sameAsCorrespondence = watch('same_as_correspondence');

  const canCopyCorrespondence =
    watchedKind === 'permanent' &&
    Boolean(correspondenceAddress?.address_line1?.trim());

  const applyCorrespondence = useCallback(() => {
    if (!correspondenceAddress) return;
    setValue('address_line1', correspondenceAddress.address_line1 ?? '', {
      shouldValidate: true
    });
    setValue('address_line2', correspondenceAddress.address_line2 ?? '', {
      shouldValidate: true
    });
    setValue('address_line3', correspondenceAddress.address_line3 ?? '', {
      shouldValidate: true
    });
    setValue('city', correspondenceAddress.city ?? '');
    setValue('state', correspondenceAddress.state ?? '', { shouldValidate: true });
    setValue('pin', correspondenceAddress.pin ?? '', { shouldValidate: true });
  }, [correspondenceAddress, setValue]);

  useEffect(() => {
    if (canCopyCorrespondence && sameAsCorrespondence) {
      applyCorrespondence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsCorrespondence, canCopyCorrespondence]);

  const lockedToCorrespondence = canCopyCorrespondence && sameAsCorrespondence;

  const stateOptions = useMemo(() => [...INDIAN_STATES], []);

  const cityOptions = useMemo(() => {
    const list = getCitiesForState(watchedState);
    if (watchedCity && !list.includes(watchedCity)) {
      return [watchedCity, ...list].sort();
    }
    return list;
  }, [watchedState, watchedCity]);

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit address' : 'Add address'}
      description="Manage correspondence or permanent address for this customer."
      size="lg"
      footer={
        <FormActions
          formId={FORM_ID}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save address"
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
        <FormSection title="Address type">
          <FormRow>
            <FormRowFull>
              <FieldLabel>Address type</FieldLabel>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      if (val !== 'permanent') {
                        setValue('same_as_correspondence', false);
                      }
                    }}
                  >
                    <SelectTrigger className={cn(formControlFieldGapClass, formControlClass)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current / Correspondence</SelectItem>
                      <SelectItem value="permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormRowFull>

            {canCopyCorrespondence ? (
              <FormRowFull>
                <Controller
                  control={control}
                  name="same_as_correspondence"
                  render={({ field }) => (
                    <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
                      <Checkbox
                        className="mt-0.5"
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                      />
                      <span>
                        Permanent address same as correspondence (current) address
                      </span>
                    </label>
                  )}
                />
              </FormRowFull>
            ) : null}
          </FormRow>
        </FormSection>

        <FormSection
          title="Address details"
          description="Street address, PIN code, state, and city."
        >
          <FormRow>
            <Controller
              control={control}
              name="address_line1"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="md:col-span-2"
                  label="Address line 1"
                  required
                  placeholder="Flat / house no., building"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={lockedToCorrespondence}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="address_line2"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="md:col-span-2"
                  label="Address line 2"
                  placeholder="Street, area, landmark (optional)"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={lockedToCorrespondence}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="address_line3"
              render={({ field, fieldState }) => (
                <TextInputField
                  className="md:col-span-2"
                  label="Address line 3"
                  placeholder="Locality, city district (optional)"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={lockedToCorrespondence}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="pin"
              render={({ field, fieldState }) => (
                <div className="relative md:col-span-2">
                  <TextInputField
                    label="PIN code"
                    required
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
                    disabled={lockedToCorrespondence}
                    error={fieldState.error?.message}
                  />
                  {pincodeLoading ? (
                    <Loader2 className="absolute right-3 top-9 size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
              )}
            />
            <Controller
              control={control}
              name="state"
              render={({ field, fieldState }) => (
                <div>
                  <FieldLabel required>State</FieldLabel>
                  <SearchableSelect
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      if (val !== watchedState)
                        setValue('city', '', { shouldDirty: true });
                    }}
                    options={stateOptions}
                    placeholder="Select state"
                    searchPlaceholder="Search state…"
                    className={formControlFieldGapClass}
                    disabled={lockedToCorrespondence}
                    error={Boolean(fieldState.error?.message)}
                  />
                  <FormFieldError message={fieldState.error?.message} />
                </div>
              )}
            />
            <Controller
              control={control}
              name="city"
              render={({ field }) => (
                <div>
                  <FieldLabel>City</FieldLabel>
                  <SearchableSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={cityOptions}
                    placeholder="Select city"
                    searchPlaceholder="Search city…"
                    className={formControlFieldGapClass}
                    disabled={lockedToCorrespondence}
                  />
                </div>
              )}
            />
          </FormRow>
        </FormSection>
      </form>
    </FormDrawer>
  );
}
