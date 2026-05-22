'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RESIDENTIAL_STATUS_OPTIONS } from '@/lib/customer/application-form-data';

export const CUSTOMER_FORM_DIALOG_CLASS =
  'flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl';

export function FormFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

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
        <div className={className}>
          <FieldLabel required={required}>{label}</FieldLabel>
          <Input
            {...field}
            value={field.value ?? ''}
            aria-invalid={fieldState.error ? true : undefined}
            placeholder={placeholder}
            className={inputClassName}
          />
          <FormFieldError message={fieldState.error?.message} />
        </div>
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
        <div className={className}>
          <Label>{label}</Label>
          <Textarea
            {...field}
            value={field.value ?? ''}
            aria-invalid={fieldState.error ? true : undefined}
            rows={rows}
            className="mt-1"
          />
          <FormFieldError message={fieldState.error?.message} />
        </div>
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
          <div>
            <Label>Date of birth</Label>
            <Input
              type="date"
              {...field}
              value={field.value ?? ''}
              aria-invalid={fieldState.error ? true : undefined}
            />
            <FormFieldError message={fieldState.error?.message} />
          </div>
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
        inputClassName="mt-1"
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
        inputClassName="mt-1"
      />
      <RhfTextarea
        control={control}
        name={'office_name_address' as FieldPath<T>}
        label="Office name & address"
        className="sm:col-span-2"
      />
      {showKyc ? (
        <>
          <Controller
            control={control}
            name={'pan_number' as FieldPath<T>}
            render={({ field, fieldState }) => (
              <div>
                <Label>PAN</Label>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  aria-invalid={fieldState.error ? true : undefined}
                  placeholder="ABCDE1234F"
                  className="mt-1 uppercase"
                />
                <FormFieldError message={fieldState.error?.message} />
              </div>
            )}
          />
          <Controller
            control={control}
            name={'aadhaar_last4' as FieldPath<T>}
            render={({ field, fieldState }) => (
              <div>
                <Label>Aadhaar number</Label>
                <Input
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value.replace(/\D/g, '').slice(0, 12)
                    )
                  }
                  onBlur={field.onBlur}
                  maxLength={12}
                  inputMode="numeric"
                  aria-invalid={fieldState.error ? true : undefined}
                  placeholder="123456789012"
                  className="mt-1"
                />
                <FormFieldError message={fieldState.error?.message} />
              </div>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
