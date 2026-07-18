'use client';

import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  COUNTRY_DIAL_CODE_OPTIONS,
  DEFAULT_COUNTRY_DIAL_CODE_OPTION,
  parseCountryDialCode,
  resolveCountryDialCodeOption
} from '@/lib/phone/country-dial-codes';
import { cn } from '@/lib/utils';

export {
  DEFAULT_COUNTRY_DIAL_CODE_OPTION,
  parseCountryDialCode,
  resolveCountryDialCodeOption
};

export type CountryCodeSelectProps = {
  /** Formatted option ("🇮🇳 India (+91)") or bare dial code ("+91") from the DB. */
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
  const resolved = resolveCountryDialCodeOption(value);

  return (
    <SearchableSelect
      value={resolved}
      onValueChange={(next) =>
        onValueChange(resolveCountryDialCodeOption(next))
      }
      options={COUNTRY_DIAL_CODE_OPTIONS}
      placeholder="Code"
      searchPlaceholder="Search country or code…"
      allowClear={false}
      disabled={disabled}
      error={error}
      className={cn('w-26 shrink-0 px-2', className)}
      contentClassName="w-72"
      renderValue={(v) => {
        const option = resolveCountryDialCodeOption(v);
        return (
          <span className="flex items-center gap-1.5">
            <span aria-hidden>{option.split(' ')[0]}</span>
            <span>{parseCountryDialCode(option)}</span>
          </span>
        );
      }}
    />
  );
}
