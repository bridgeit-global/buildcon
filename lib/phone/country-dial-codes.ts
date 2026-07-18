/** ISO 3166-1 alpha-2 country + E.164 calling code, for the mobile number country picker. */
export type CountryDialCode = {
  iso2: string;
  name: string;
  dialCode: string;
  /** Typical national mobile number length (digits, excluding the dial code) — drives input max length. */
  phoneLength: number;
};

/** Converts an ISO 3166-1 alpha-2 code (e.g. "IN") to its flag emoji. */
export function countryFlagEmoji(iso2: string): string {
  const codePoints = iso2
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { iso2: 'IN', name: 'India', dialCode: '+91', phoneLength: 10 },
  { iso2: 'US', name: 'United States', dialCode: '+1', phoneLength: 10 },
  { iso2: 'AE', name: 'United Arab Emirates', dialCode: '+971', phoneLength: 9 },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '+44', phoneLength: 10 },
  { iso2: 'SG', name: 'Singapore', dialCode: '+65', phoneLength: 8 },
  { iso2: 'AU', name: 'Australia', dialCode: '+61', phoneLength: 9 },
  { iso2: 'CA', name: 'Canada', dialCode: '+1', phoneLength: 10 },
  { iso2: 'SA', name: 'Saudi Arabia', dialCode: '+966', phoneLength: 9 },
  { iso2: 'QA', name: 'Qatar', dialCode: '+974', phoneLength: 8 },
  { iso2: 'KW', name: 'Kuwait', dialCode: '+965', phoneLength: 8 },
  { iso2: 'OM', name: 'Oman', dialCode: '+968', phoneLength: 8 },
  { iso2: 'BH', name: 'Bahrain', dialCode: '+973', phoneLength: 8 },
  { iso2: 'AF', name: 'Afghanistan', dialCode: '+93', phoneLength: 9 },
  { iso2: 'AL', name: 'Albania', dialCode: '+355', phoneLength: 9 },
  { iso2: 'DZ', name: 'Algeria', dialCode: '+213', phoneLength: 9 },
  { iso2: 'AR', name: 'Argentina', dialCode: '+54', phoneLength: 10 },
  { iso2: 'AM', name: 'Armenia', dialCode: '+374', phoneLength: 8 },
  { iso2: 'AT', name: 'Austria', dialCode: '+43', phoneLength: 10 },
  { iso2: 'AZ', name: 'Azerbaijan', dialCode: '+994', phoneLength: 9 },
  { iso2: 'BD', name: 'Bangladesh', dialCode: '+880', phoneLength: 10 },
  { iso2: 'BY', name: 'Belarus', dialCode: '+375', phoneLength: 9 },
  { iso2: 'BE', name: 'Belgium', dialCode: '+32', phoneLength: 9 },
  { iso2: 'BT', name: 'Bhutan', dialCode: '+975', phoneLength: 8 },
  { iso2: 'BO', name: 'Bolivia', dialCode: '+591', phoneLength: 8 },
  { iso2: 'BA', name: 'Bosnia and Herzegovina', dialCode: '+387', phoneLength: 8 },
  { iso2: 'BR', name: 'Brazil', dialCode: '+55', phoneLength: 11 },
  { iso2: 'BN', name: 'Brunei', dialCode: '+673', phoneLength: 7 },
  { iso2: 'BG', name: 'Bulgaria', dialCode: '+359', phoneLength: 9 },
  { iso2: 'KH', name: 'Cambodia', dialCode: '+855', phoneLength: 9 },
  { iso2: 'CM', name: 'Cameroon', dialCode: '+237', phoneLength: 9 },
  { iso2: 'CL', name: 'Chile', dialCode: '+56', phoneLength: 9 },
  { iso2: 'CN', name: 'China', dialCode: '+86', phoneLength: 11 },
  { iso2: 'CO', name: 'Colombia', dialCode: '+57', phoneLength: 10 },
  { iso2: 'CR', name: 'Costa Rica', dialCode: '+506', phoneLength: 8 },
  { iso2: 'HR', name: 'Croatia', dialCode: '+385', phoneLength: 9 },
  { iso2: 'CY', name: 'Cyprus', dialCode: '+357', phoneLength: 8 },
  { iso2: 'CZ', name: 'Czech Republic', dialCode: '+420', phoneLength: 9 },
  { iso2: 'DK', name: 'Denmark', dialCode: '+45', phoneLength: 8 },
  { iso2: 'EG', name: 'Egypt', dialCode: '+20', phoneLength: 10 },
  { iso2: 'EE', name: 'Estonia', dialCode: '+372', phoneLength: 8 },
  { iso2: 'ET', name: 'Ethiopia', dialCode: '+251', phoneLength: 9 },
  { iso2: 'FJ', name: 'Fiji', dialCode: '+679', phoneLength: 7 },
  { iso2: 'FI', name: 'Finland', dialCode: '+358', phoneLength: 9 },
  { iso2: 'FR', name: 'France', dialCode: '+33', phoneLength: 9 },
  { iso2: 'GE', name: 'Georgia', dialCode: '+995', phoneLength: 9 },
  { iso2: 'DE', name: 'Germany', dialCode: '+49', phoneLength: 11 },
  { iso2: 'GH', name: 'Ghana', dialCode: '+233', phoneLength: 9 },
  { iso2: 'GR', name: 'Greece', dialCode: '+30', phoneLength: 10 },
  { iso2: 'HK', name: 'Hong Kong', dialCode: '+852', phoneLength: 8 },
  { iso2: 'HU', name: 'Hungary', dialCode: '+36', phoneLength: 9 },
  { iso2: 'IS', name: 'Iceland', dialCode: '+354', phoneLength: 7 },
  { iso2: 'ID', name: 'Indonesia', dialCode: '+62', phoneLength: 11 },
  { iso2: 'IR', name: 'Iran', dialCode: '+98', phoneLength: 10 },
  { iso2: 'IQ', name: 'Iraq', dialCode: '+964', phoneLength: 10 },
  { iso2: 'IE', name: 'Ireland', dialCode: '+353', phoneLength: 9 },
  { iso2: 'IL', name: 'Israel', dialCode: '+972', phoneLength: 9 },
  { iso2: 'IT', name: 'Italy', dialCode: '+39', phoneLength: 10 },
  { iso2: 'JM', name: 'Jamaica', dialCode: '+1876', phoneLength: 7 },
  { iso2: 'JP', name: 'Japan', dialCode: '+81', phoneLength: 10 },
  { iso2: 'JO', name: 'Jordan', dialCode: '+962', phoneLength: 9 },
  { iso2: 'KZ', name: 'Kazakhstan', dialCode: '+7', phoneLength: 10 },
  { iso2: 'KE', name: 'Kenya', dialCode: '+254', phoneLength: 9 },
  { iso2: 'KR', name: 'South Korea', dialCode: '+82', phoneLength: 10 },
  { iso2: 'KG', name: 'Kyrgyzstan', dialCode: '+996', phoneLength: 9 },
  { iso2: 'LA', name: 'Laos', dialCode: '+856', phoneLength: 9 },
  { iso2: 'LV', name: 'Latvia', dialCode: '+371', phoneLength: 8 },
  { iso2: 'LB', name: 'Lebanon', dialCode: '+961', phoneLength: 8 },
  { iso2: 'LY', name: 'Libya', dialCode: '+218', phoneLength: 9 },
  { iso2: 'LI', name: 'Liechtenstein', dialCode: '+423', phoneLength: 7 },
  { iso2: 'LT', name: 'Lithuania', dialCode: '+370', phoneLength: 8 },
  { iso2: 'LU', name: 'Luxembourg', dialCode: '+352', phoneLength: 9 },
  { iso2: 'MO', name: 'Macau', dialCode: '+853', phoneLength: 8 },
  { iso2: 'MY', name: 'Malaysia', dialCode: '+60', phoneLength: 9 },
  { iso2: 'MV', name: 'Maldives', dialCode: '+960', phoneLength: 7 },
  { iso2: 'MT', name: 'Malta', dialCode: '+356', phoneLength: 8 },
  { iso2: 'MU', name: 'Mauritius', dialCode: '+230', phoneLength: 8 },
  { iso2: 'MX', name: 'Mexico', dialCode: '+52', phoneLength: 10 },
  { iso2: 'MD', name: 'Moldova', dialCode: '+373', phoneLength: 8 },
  { iso2: 'MC', name: 'Monaco', dialCode: '+377', phoneLength: 8 },
  { iso2: 'MN', name: 'Mongolia', dialCode: '+976', phoneLength: 8 },
  { iso2: 'ME', name: 'Montenegro', dialCode: '+382', phoneLength: 8 },
  { iso2: 'MA', name: 'Morocco', dialCode: '+212', phoneLength: 9 },
  { iso2: 'MM', name: 'Myanmar', dialCode: '+95', phoneLength: 9 },
  { iso2: 'NA', name: 'Namibia', dialCode: '+264', phoneLength: 9 },
  { iso2: 'NP', name: 'Nepal', dialCode: '+977', phoneLength: 10 },
  { iso2: 'NL', name: 'Netherlands', dialCode: '+31', phoneLength: 9 },
  { iso2: 'NZ', name: 'New Zealand', dialCode: '+64', phoneLength: 9 },
  { iso2: 'NG', name: 'Nigeria', dialCode: '+234', phoneLength: 10 },
  { iso2: 'NO', name: 'Norway', dialCode: '+47', phoneLength: 8 },
  { iso2: 'PK', name: 'Pakistan', dialCode: '+92', phoneLength: 10 },
  { iso2: 'PA', name: 'Panama', dialCode: '+507', phoneLength: 8 },
  { iso2: 'PG', name: 'Papua New Guinea', dialCode: '+675', phoneLength: 8 },
  { iso2: 'PY', name: 'Paraguay', dialCode: '+595', phoneLength: 9 },
  { iso2: 'PE', name: 'Peru', dialCode: '+51', phoneLength: 9 },
  { iso2: 'PH', name: 'Philippines', dialCode: '+63', phoneLength: 10 },
  { iso2: 'PL', name: 'Poland', dialCode: '+48', phoneLength: 9 },
  { iso2: 'PT', name: 'Portugal', dialCode: '+351', phoneLength: 9 },
  { iso2: 'RO', name: 'Romania', dialCode: '+40', phoneLength: 9 },
  { iso2: 'RU', name: 'Russia', dialCode: '+7', phoneLength: 10 },
  { iso2: 'RW', name: 'Rwanda', dialCode: '+250', phoneLength: 9 },
  { iso2: 'LK', name: 'Sri Lanka', dialCode: '+94', phoneLength: 9 },
  { iso2: 'RS', name: 'Serbia', dialCode: '+381', phoneLength: 9 },
  { iso2: 'SC', name: 'Seychelles', dialCode: '+248', phoneLength: 7 },
  { iso2: 'SK', name: 'Slovakia', dialCode: '+421', phoneLength: 9 },
  { iso2: 'SI', name: 'Slovenia', dialCode: '+386', phoneLength: 8 },
  { iso2: 'ZA', name: 'South Africa', dialCode: '+27', phoneLength: 9 },
  { iso2: 'ES', name: 'Spain', dialCode: '+34', phoneLength: 9 },
  { iso2: 'SD', name: 'Sudan', dialCode: '+249', phoneLength: 9 },
  { iso2: 'SE', name: 'Sweden', dialCode: '+46', phoneLength: 9 },
  { iso2: 'CH', name: 'Switzerland', dialCode: '+41', phoneLength: 9 },
  { iso2: 'TW', name: 'Taiwan', dialCode: '+886', phoneLength: 9 },
  { iso2: 'TJ', name: 'Tajikistan', dialCode: '+992', phoneLength: 9 },
  { iso2: 'TZ', name: 'Tanzania', dialCode: '+255', phoneLength: 9 },
  { iso2: 'TH', name: 'Thailand', dialCode: '+66', phoneLength: 9 },
  { iso2: 'TN', name: 'Tunisia', dialCode: '+216', phoneLength: 8 },
  { iso2: 'TR', name: 'Turkey', dialCode: '+90', phoneLength: 10 },
  { iso2: 'TM', name: 'Turkmenistan', dialCode: '+993', phoneLength: 8 },
  { iso2: 'UG', name: 'Uganda', dialCode: '+256', phoneLength: 9 },
  { iso2: 'UA', name: 'Ukraine', dialCode: '+380', phoneLength: 9 },
  { iso2: 'UY', name: 'Uruguay', dialCode: '+598', phoneLength: 8 },
  { iso2: 'UZ', name: 'Uzbekistan', dialCode: '+998', phoneLength: 9 },
  { iso2: 'VE', name: 'Venezuela', dialCode: '+58', phoneLength: 10 },
  { iso2: 'VN', name: 'Vietnam', dialCode: '+84', phoneLength: 9 },
  { iso2: 'YE', name: 'Yemen', dialCode: '+967', phoneLength: 9 },
  { iso2: 'ZM', name: 'Zambia', dialCode: '+260', phoneLength: 9 },
  { iso2: 'ZW', name: 'Zimbabwe', dialCode: '+263', phoneLength: 9 }
];

export const DEFAULT_COUNTRY_DIAL_CODE =
  COUNTRY_DIAL_CODES.find((c) => c.iso2 === 'IN') ?? COUNTRY_DIAL_CODES[0];

/** Combined "🇮🇳 India (+91)" label used as the option/value for the country picker. */
export function formatCountryDialCodeOption(country: CountryDialCode): string {
  return `${countryFlagEmoji(country.iso2)} ${country.name} (${country.dialCode})`;
}

/** Extracts the "+91" dial code back out of a formatted option label. */
export function parseCountryDialCode(option: string): string {
  const match = option.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : option;
}

export const COUNTRY_DIAL_CODE_OPTIONS = COUNTRY_DIAL_CODES.map(formatCountryDialCodeOption);

export const DEFAULT_COUNTRY_DIAL_CODE_OPTION = formatCountryDialCodeOption(
  DEFAULT_COUNTRY_DIAL_CODE
);

const COUNTRY_BY_OPTION = new Map<string, CountryDialCode>(
  COUNTRY_DIAL_CODES.map((c) => [formatCountryDialCodeOption(c), c])
);

/**
 * Maps a stored dial code ("+91") or a picker label ("🇮🇳 India (+91)") to a
 * known option value. DB defaults and older rows store bare dial codes.
 */
export function resolveCountryDialCodeOption(
  value: string | null | undefined
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_COUNTRY_DIAL_CODE_OPTION;
  if (COUNTRY_BY_OPTION.has(raw)) return raw;

  const dialFromParens = parseCountryDialCode(raw);
  const dial = (dialFromParens.startsWith('+')
    ? dialFromParens
    : `+${dialFromParens.replace(/\D/g, '')}`
  ).trim();
  const country = COUNTRY_DIAL_CODES.find((c) => c.dialCode === dial);
  if (country) return formatCountryDialCodeOption(country);

  return DEFAULT_COUNTRY_DIAL_CODE_OPTION;
}

/** Expected mobile number digit length for a country option or bare dial code; falls back to 10. */
export function phoneLengthForOption(option: string): number {
  const resolved = resolveCountryDialCodeOption(option);
  return (
    COUNTRY_BY_OPTION.get(resolved)?.phoneLength ??
    DEFAULT_COUNTRY_DIAL_CODE.phoneLength
  );
}
