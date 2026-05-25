'use client';

import { useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';
import { getCitiesForState } from '@/lib/address/indian-state-cities';

type Props = {
  addressLine: string;
  city: string;
  state: string;
  pin: string;
  onAddressLineChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onPinChange: (value: string) => void;
  addressLineInvalid?: boolean;
};

export function BookingAddressFields({
  addressLine,
  city,
  state,
  pin,
  onAddressLineChange,
  onCityChange,
  onStateChange,
  onPinChange,
  addressLineInvalid
}: Props) {
  const onPincodeResult = useCallback(
    (result: { city: string; state: string }) => {
      onStateChange(result.state);
      onCityChange(result.city);
    },
    [onCityChange, onStateChange]
  );

  const { loading, handlePinChange } = usePincodeLookup(onPincodeResult);

  const stateOptions = useMemo(() => [...INDIAN_STATES], []);

  const cityOptions = useMemo(() => {
    const list = getCitiesForState(state);
    if (city && !list.includes(city)) {
      return [city, ...list].sort();
    }
    return list;
  }, [state, city]);

  const handleStateChange = useCallback(
    (val: string) => {
      onStateChange(val);
      if (val !== state) onCityChange('');
    },
    [onStateChange, onCityChange, state]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="sm:col-span-2">
        <Input
          value={addressLine}
          placeholder="Address line"
          onChange={(e) => onAddressLineChange(e.target.value)}
          aria-invalid={addressLineInvalid || undefined}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Input
            value={pin}
            placeholder="PIN code"
            maxLength={6}
            inputMode="numeric"
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              onPinChange(val);
              handlePinChange(val);
            }}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ds-gray-400" />
          )}
        </div>
        <SearchableSelect
          value={city}
          onValueChange={onCityChange}
          options={cityOptions}
          placeholder="Select city"
          searchPlaceholder="Search city…"
        />
        <SearchableSelect
          value={state}
          onValueChange={handleStateChange}
          options={stateOptions}
          placeholder="Select state"
          searchPlaceholder="Search state…"
        />
      </div>
    </div>
  );
}
