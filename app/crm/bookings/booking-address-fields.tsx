'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePincodeLookup } from '@/lib/address/use-pincode-lookup';
import { INDIAN_STATES } from '@/lib/address/pincode-lookup';

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

/**
 * Reusable address fields block with PIN-code auto-fill.
 * When a valid 6-digit PIN is entered, city and state are fetched
 * from the India Post API and auto-populated.
 */
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
      onCityChange(result.city);
      onStateChange(result.state);
    },
    [onCityChange, onStateChange]
  );

  const { loading, handlePinChange } = usePincodeLookup(onPincodeResult);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Input
          value={addressLine}
          placeholder="Address line"
          onChange={(e) => onAddressLineChange(e.target.value)}
          aria-invalid={addressLineInvalid || undefined}
        />
      </div>
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
      <Input
        value={city}
        placeholder="City / District"
        onChange={(e) => onCityChange(e.target.value)}
      />
      <Select value={state} onValueChange={onStateChange}>
        <SelectTrigger className="w-full">
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
    </div>
  );
}
