'use client';

import { useMemo } from 'react';
import type { Control, FieldErrors, FieldPath, FieldValues } from 'react-hook-form';
import { Controller, useController, useWatch } from 'react-hook-form';
import { TextInputField } from '@/components/ui/text-input-field';
import { FieldLabel } from '@/components/ui/field-label';
import { Button } from '@/components/ui/button';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import { DobInputField } from '@/components/ui/dob-input-field';
import { FormSection } from '@/components/ui/form-section';
import { FormRow, FormRowFull } from '@/components/ui/form-row';
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
import { RESIDENTIAL_STATUS_OPTIONS } from '@/lib/customer/application-form-data';
import {
  EMPTY_APPLICATION_ADDRESS,
  guardianNameFieldLabel
} from '@/lib/customer/customer-forms.schema';
import { useMasterLookup } from '@/lib/master/use-master-lookup';
import { mergeLookupOptions } from '@/lib/master/master-lookup';
import { cn } from '@/lib/utils';
import {
  ApplicationAddressFields,
  type ApplicationAddressValues
} from '@/app/crm/bookings/application-address-fields';

export { FormFieldError } from '@/components/ui/form-field-error';

type BaseProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  className?: string;
};

export function RhfTextInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  className,
  inputClassName,
  required
}: BaseProps<T> & {
  placeholder?: string;
  inputClassName?: string;
  required?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInputField
          {...field}
          value={field.value ?? ''}
          label={label}
          required={required}
          placeholder={placeholder}
          inputClassName={inputClassName}
          className={className}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function RhfPhoneInput<T extends FieldValues>({
  control,
  name,
  countryName,
  label,
  required
}: BaseProps<T> & { required?: boolean; countryName?: FieldPath<T> }) {
  const { field, fieldState } = useController({ control, name });
  const { field: countryField } = useController({
    control,
    name: countryName ?? (`${name}_country` as FieldPath<T>)
  });
  return (
    <PhoneInputField
      label={label}
      required={required}
      value={field.value ?? ''}
      onChange={field.onChange}
      countryCode={countryField.value}
      onCountryCodeChange={countryField.onChange}
      error={fieldState.error?.message}
    />
  );
}

export function RhfEmailInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder
}: BaseProps<T> & { placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <EmailInputField
          label={label}
          value={field.value ?? ''}
          onChange={field.onChange}
          placeholder={placeholder}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function RhfPanInput<T extends FieldValues>({
  control,
  name,
  label,
  required
}: BaseProps<T> & { required?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <PanInputField
          label={label}
          required={required}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function RhfAadhaarInput<T extends FieldValues>({
  control,
  name,
  label,
  required
}: BaseProps<T> & { required?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AadhaarInputField
          label={label}
          required={required}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

function RhfPassportInput<T extends FieldValues>({
  control
}: {
  control: Control<T>;
}) {
  const residentialStatus = useWatch({
    control,
    name: 'residential_status' as FieldPath<T>
  }) as string | undefined;
  if (residentialStatus === 'Resident Indian') return null;
  return (
    <RhfTextInput
      control={control}
      name={'passport_number' as FieldPath<T>}
      label="Passport no. (NRI / foreign)"
    />
  );
}

function RhfGuardianNameInput<T extends FieldValues>({
  control
}: {
  control: Control<T>;
}) {
  const relation = useWatch({
    control,
    name: 'guardian_relation' as FieldPath<T>
  }) as string | undefined;
  return (
    <RhfTextInput
      control={control}
      name={'guardian_name' as FieldPath<T>}
      label={guardianNameFieldLabel(relation)}
      placeholder="As on PAN / Aadhaar"
    />
  );
}

function RhfCustomerRelationSelect<T extends FieldValues>({
  control
}: {
  control: Control<T>;
}) {
  const { activeNames } = useMasterLookup('customer_relation');
  const { field } = useController({
    control,
    name: 'guardian_relation' as FieldPath<T>
  });
  const options = useMemo(
    () => mergeLookupOptions(activeNames, [String(field.value ?? '')]),
    [activeNames, field.value]
  );
  return (
    <div>
      <FieldLabel>Customer relation</FieldLabel>
      <Select value={field.value || undefined} onValueChange={field.onChange}>
        <SelectTrigger className={cn(formControlFieldGapClass, formControlClass)}>
          <SelectValue placeholder="Select relation" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function isAddressFieldErrors(
  errors:
    | FieldErrors<ApplicationAddressValues>
    | { message?: string }
    | undefined
): errors is FieldErrors<ApplicationAddressValues> {
  return (
    !!errors &&
    ('address_line1' in errors ||
      'address_line2' in errors ||
      'address_line3' in errors ||
      'pin' in errors ||
      'state' in errors)
  );
}

function addressFieldErrors(
  errors:
    | FieldErrors<ApplicationAddressValues>
    | { message?: string }
    | undefined
) {
  if (!isAddressFieldErrors(errors)) return {};
  return {
    line1: errors.address_line1?.message,
    line2: errors.address_line2?.message,
    line3: errors.address_line3?.message,
    pin: errors.pin?.message,
    city: errors.city?.message,
    state: errors.state?.message
  };
}

function CustomerCreateAddressSection<T extends FieldValues>({
  control
}: {
  control: Control<T>;
}) {
  const permanentSame = useWatch({
    control,
    name: 'permanent_same_as_correspondence' as FieldPath<T>
  }) as 'same' | 'different' | undefined;

  return (
    <FormSection
      title="Address"
      description="Residential and permanent address details for the customer profile."
    >
      <FormRowFull>
        <div className="space-y-2">
          <FieldLabel required>Residential address</FieldLabel>
          <Controller
            control={control}
            name={'residential_address' as FieldPath<T>}
            render={({ field, formState }) => (
              <ApplicationAddressFields
                values={field.value ?? EMPTY_APPLICATION_ADDRESS}
                onChange={(patch) => field.onChange({ ...field.value, ...patch })}
                errors={addressFieldErrors(
                  formState.errors.residential_address as
                    | FieldErrors<ApplicationAddressValues>
                    | undefined
                )}
              />
            )}
          />
        </div>
      </FormRowFull>

      <FormRowFull>
        <div className="space-y-3">
          <FieldLabel required>
            Permanent address same as correspondence address?
          </FieldLabel>
          <Controller
            control={control}
            name={'permanent_same_as_correspondence' as FieldPath<T>}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['same', 'Same'],
                    ['different', 'Different']
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={field.value === value ? 'default' : 'outline'}
                    onClick={() => field.onChange(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          />
          {permanentSame === 'different' ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <FieldLabel required>Permanent address</FieldLabel>
              <Controller
                control={control}
                name={'permanent_address' as FieldPath<T>}
                render={({ field, formState }) => (
                  <ApplicationAddressFields
                    values={field.value ?? EMPTY_APPLICATION_ADDRESS}
                    onChange={(patch) =>
                      field.onChange({ ...field.value, ...patch })
                    }
                    errors={addressFieldErrors(
                      formState.errors.permanent_address as
                        | FieldErrors<ApplicationAddressValues>
                        | undefined
                    )}
                  />
                )}
              />
            </div>
          ) : null}
        </div>
      </FormRowFull>
    </FormSection>
  );
}

export function CustomerProfileFields<T extends FieldValues>({
  control,
  showKyc = false,
  showAddress = false
}: {
  control: Control<T>;
  showKyc?: boolean;
  showAddress?: boolean;
}) {
  return (
    <div className="space-y-6">
      <FormSection
        title="Basic information"
        description="Contact details and personal information for the customer."
      >
        <FormRow>
          <RhfTextInput
            control={control}
            name={'first_name' as FieldPath<T>}
            label="First name"
            required
            placeholder="e.g. Amit"
          />
          <RhfTextInput
            control={control}
            name={'middle_name' as FieldPath<T>}
            label="Middle name"
            placeholder="Optional"
          />
          <RhfTextInput
            control={control}
            name={'last_name' as FieldPath<T>}
            label="Last name"
            required
            placeholder="e.g. Deshmukh"
          />
          <RhfPhoneInput
            control={control}
            name={'phone' as FieldPath<T>}
            countryName={'phone_country' as FieldPath<T>}
            label="Primary mobile number"
            required
          />
          <RhfPhoneInput
            control={control}
            name={'phone_secondary' as FieldPath<T>}
            countryName={'phone_secondary_country' as FieldPath<T>}
            label="Secondary mobile number"
          />
          <RhfEmailInput
            control={control}
            name={'email' as FieldPath<T>}
            label="Email"
            placeholder="name@email.com"
          />
          <Controller
            control={control}
            name={'dob' as FieldPath<T>}
            render={({ field, fieldState }) => (
              <DobInputField
                label="Date of birth"
                value={field.value ?? ''}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <RhfTextInput
            control={control}
            name={'occupation' as FieldPath<T>}
            label="Occupation"
            placeholder="Salaried / Business…"
          />
        </FormRow>
      </FormSection>

      <FormSection
        title="Identity & residency"
        description="Nationality, guardian details, and residential status."
      >
        <FormRow>
          <Controller
            control={control}
            name={'nationality' as FieldPath<T>}
            render={({ field }) => (
              <div>
                <FieldLabel>Nationality</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={cn(formControlFieldGapClass, formControlClass)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Indian">Indian</SelectItem>
                    <SelectItem value="NRI">NRI</SelectItem>
                    <SelectItem value="Foreign National">Foreign National</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <RhfCustomerRelationSelect control={control} />
          <RhfGuardianNameInput control={control} />
          <Controller
            control={control}
            name={'residential_status' as FieldPath<T>}
            render={({ field }) => (
              <div>
                <FieldLabel>Residential status</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={cn(formControlFieldGapClass, formControlClass)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESIDENTIAL_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <RhfPassportInput control={control} />
        </FormRow>
      </FormSection>

      {showKyc ? (
        <FormSection
          title="Identity & KYC"
          description="Government ID numbers used for verification."
        >
          <FormRow>
            <RhfPanInput
              control={control}
              name={'pan_number' as FieldPath<T>}
              label="PAN"
            />
            <RhfAadhaarInput
              control={control}
              name={'aadhaar_last4' as FieldPath<T>}
              label="Aadhaar number"
            />
          </FormRow>
        </FormSection>
      ) : null}

      {showAddress ? <CustomerCreateAddressSection control={control} /> : null}
    </div>
  );
}
