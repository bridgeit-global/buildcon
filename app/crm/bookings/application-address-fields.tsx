'use client';

import { useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { FormFieldError } from '@/components/ui/form-field-error';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';
import { getCitiesForState } from '@/lib/address/indian-state-cities';

export type ApplicationAddressValues = {
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city: string;
  state: string;
  pin: string;
};

type FieldErrors = Partial<
  Record<
    'line1' | 'line2' | 'line3' | 'pin' | 'city' | 'state',
    string | undefined
  >
>;

type Props = {
  values: ApplicationAddressValues;
  onChange: (patch: Partial<ApplicationAddressValues>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
};

export function ApplicationAddressFields({
  values,
  onChange,
  errors,
  disabled
}: Props) {
  const onPincodeResult = useCallback(
    (result: { city: string; state: string }) => {
      onChange({ state: result.state, city: result.city });
    },
    [onChange]
  );

  const { loading, handlePinChange } = usePincodeLookup(onPincodeResult);
  const stateOptions = useMemo(() => [...INDIAN_STATES], []);
  const cityOptions = useMemo(() => {
    const list = getCitiesForState(values.state);
    if (values.city && !list.includes(values.city)) {
      return [values.city, ...list].sort();
    }
    return list;
  }, [values.state, values.city]);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Input
          value={values.address_line1}
          placeholder="Address line 1"
          disabled={disabled}
          onChange={(e) => onChange({ address_line1: e.target.value })}
          aria-invalid={errors?.line1 ? true : undefined}
        />
        <FormFieldError message={errors?.line1} />
      </div>
      <div>
        <Input
          value={values.address_line2}
          placeholder="Address line 2 (optional)"
          disabled={disabled}
          onChange={(e) => onChange({ address_line2: e.target.value })}
          aria-invalid={errors?.line2 ? true : undefined}
        />
        <FormFieldError message={errors?.line2} />
      </div>
      <div>
        <Input
          value={values.address_line3}
          placeholder="Address line 3 (optional)"
          disabled={disabled}
          onChange={(e) => onChange({ address_line3: e.target.value })}
          aria-invalid={errors?.line3 ? true : undefined}
        />
        <FormFieldError message={errors?.line3} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Input
            value={values.pin}
            placeholder="PIN code"
            maxLength={6}
            inputMode="numeric"
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              onChange({ pin: val });
              handlePinChange(val);
            }}
            aria-invalid={errors?.pin ? true : undefined}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ds-gray-400" />
          )}
          <FormFieldError message={errors?.pin} />
        </div>
        <div>
          <SearchableSelect
            value={values.state}
            onValueChange={(state) => {
              onChange(state === values.state ? { state } : { state, city: '' });
            }}
            options={stateOptions}
            placeholder="Select state"
            searchPlaceholder="Search state…"
            disabled={disabled}
          />
          <FormFieldError message={errors?.state} />
        </div>
        <div>
          <SearchableSelect
            value={values.city}
            onValueChange={(city) => onChange({ city })}
            options={cityOptions}
            placeholder="Select city"
            searchPlaceholder="Search city…"
            disabled={disabled}
          />
          <FormFieldError message={errors?.city} />
        </div>
      </div>
    </div>
  );
}

export function applicationAddressFromRow(
  row:
    | {
        address_line1?: string | null;
        address_line2?: string | null;
        address_line3?: string | null;
        city?: string | null;
        state?: string | null;
        pin?: string | null;
      }
    | null
    | undefined
): ApplicationAddressValues {
  return {
    address_line1: row?.address_line1 ?? '',
    address_line2: row?.address_line2 ?? '',
    address_line3: row?.address_line3 ?? '',
    city: row?.city ?? '',
    state: row?.state ?? '',
    pin: row?.pin ?? ''
  };
}

export function applicationAddressToPayload(values: ApplicationAddressValues) {
  return {
    address_line1: values.address_line1.trim() || null,
    address_line2: values.address_line2.trim() || null,
    address_line3: values.address_line3.trim() || null,
    city: values.city.trim() || null,
    state: values.state.trim() || null,
    pin: values.pin.trim() || null
  };
}
