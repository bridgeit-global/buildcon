export const BRAND_THEMES = ['executive', 'emerald', 'luxury'] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];

export const COLOR_MODES = ['light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const BRAND_THEME_STORAGE_KEY = 'buildcon_brand_theme';
export const COLOR_MODE_STORAGE_KEY = 'buildcon_color_mode';

export const DEFAULT_BRAND_THEME: BrandTheme = 'executive';
export const DEFAULT_COLOR_MODE: ColorMode = 'light';

export const BRAND_THEME_LABELS: Record<BrandTheme, string> = {
  executive: 'Executive Blue',
  emerald: 'Emerald Estate',
  luxury: 'Luxury Gold'
};

export function isBrandTheme(value: unknown): value is BrandTheme {
  return (
    typeof value === 'string' &&
    (BRAND_THEMES as readonly string[]).includes(value)
  );
}

export function isColorMode(value: unknown): value is ColorMode {
  return (
    typeof value === 'string' &&
    (COLOR_MODES as readonly string[]).includes(value)
  );
}

export function applyThemeToDocument(
  brand: BrandTheme,
  mode: ColorMode
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', brand);
  root.classList.toggle('dark', mode === 'dark');
}

/** Inline script body — keep in sync with storage keys and defaults above. */
export const THEME_INIT_SCRIPT = `(function(){try{var b=localStorage.getItem('${BRAND_THEME_STORAGE_KEY}');var m=localStorage.getItem('${COLOR_MODE_STORAGE_KEY}');var brands=['executive','emerald','luxury'];var brand=brands.indexOf(b)!==-1?b:'${DEFAULT_BRAND_THEME}';var mode=m==='dark'?'dark':'${DEFAULT_COLOR_MODE}';var r=document.documentElement;r.setAttribute('data-theme',brand);if(mode==='dark')r.classList.add('dark');else r.classList.remove('dark');}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_BRAND_THEME}');}})();`;
