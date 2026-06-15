'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RESIDENTIAL_STATUS_OPTIONS } from '@/lib/customer/application-form-data';
import { cn } from '@/lib/utils';

export const CUSTOMER_FORM_DIALOG_CLASS =
  'flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl';

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
  label,
  required
}: BaseProps<T> & { required?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <PhoneInputField
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

export function RhfTextarea<T extends FieldValues>({
  control,
  name,
  label,
  rows = 2,
  className
}: BaseProps<T> & { rows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextareaField
          {...field}
          value={field.value ?? ''}
          label={label}
          rows={rows}
          className={className}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function CustomerProfileFields<T extends FieldValues>({
  control,
  showKyc = false
}: {
  control: Control<T>;
  showKyc?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <RhfTextInput
        control={control}
        name={'full_name' as FieldPath<T>}
        label="Full name"
        required
        placeholder="e.g. Mr. Amit Deshmukh"
        className="sm:col-span-2"
      />
      <RhfPhoneInput
        control={control}
        name={'phone' as FieldPath<T>}
        label="Phone"
        required
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
          <TextInputField
            {...field}
            value={field.value ?? ''}
            label="Date of birth"
            type="date"
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
      <Controller
        control={control}
        name={'nationality' as FieldPath<T>}
        render={({ field }) => (
          <div className="sm:col-span-2">
            <Label>Nationality</Label>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="mt-1 w-full">
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
      <RhfTextInput
        control={control}
        name={'guardian_name' as FieldPath<T>}
        label={"Father's / mother's / spouse's name"}
        placeholder="As on PAN / Aadhaar"
        className="sm:col-span-2"
      />
      <Controller
        control={control}
        name={'residential_status' as FieldPath<T>}
        render={({ field }) => (
          <div className="sm:col-span-2">
            <Label>Residential status</Label>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="mt-1 w-full">
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
      <RhfTextInput
        control={control}
        name={'passport_number' as FieldPath<T>}
        label="Passport no. (NRI / foreign)"
      />
      <RhfTextarea
        control={control}
        name={'office_name_address' as FieldPath<T>}
        label="Office name & address"
        className="sm:col-span-2"
      />
      {showKyc ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
