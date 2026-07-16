'use client';

import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  COUNTRY_DIAL_CODE_OPTIONS,
  DEFAULT_COUNTRY_DIAL_CODE_OPTION,
  parseCountryDialCode
} from '@/lib/phone/country-dial-codes';
import { cn } from '@/lib/utils';

export { DEFAULT_COUNTRY_DIAL_CODE_OPTION, parseCountryDialCode };

export type CountryCodeSelectProps = {
  /** Formatted option, e.g. "🇮🇳 India (+91)" — use `parseCountryDialCode()` to get just "+91". */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  error?: boolean;
};

/** Searchable country + dial-code picker (flag, name, code) for use beside a phone number input. */
export function CountryCodeSelect({
  value,
  onValueChange,
  className,
  disabled,
  error
}: CountryCodeSelectProps) {
  return (
    <SearchableSelect
      value={value || DEFAULT_COUNTRY_DIAL_CODE_OPTION}
      onValueChange={(next) => onValueChange(next || DEFAULT_COUNTRY_DIAL_CODE_OPTION)}
      options={COUNTRY_DIAL_CODE_OPTIONS}
      placeholder="Code"
      searchPlaceholder="Search country or code…"
      allowClear={false}
      disabled={disabled}
      error={error}
      className={cn('w-26 shrink-0 px-2', className)}
      contentClassName="w-72"
      renderValue={(v) => (
        <span className="flex items-center gap-1.5">
          <span>{v.split(' ')[0]}</span>
          <span>{parseCountryDialCode(v)}</span>
        </span>
      )}
    />
  );
}
