'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  applyThemeToDocument,
  BRAND_THEME_STORAGE_KEY,
  COLOR_MODE_STORAGE_KEY,
  DEFAULT_BRAND_THEME,
  DEFAULT_COLOR_MODE,
  isBrandTheme,
  isColorMode,
  type BrandTheme,
  type ColorMode
} from '@/lib/theme';

type ThemeContextValue = {
  brand: BrandTheme;
  mode: ColorMode;
  setBrand: (brand: BrandTheme) => void;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredBrand(): BrandTheme {
  if (typeof window === 'undefined') return DEFAULT_BRAND_THEME;
  try {
    const raw = localStorage.getItem(BRAND_THEME_STORAGE_KEY);
    return isBrandTheme(raw) ? raw : DEFAULT_BRAND_THEME;
  } catch {
    return DEFAULT_BRAND_THEME;
  }
}

function readStoredMode(): ColorMode {
  if (typeof window === 'undefined') return DEFAULT_COLOR_MODE;
  try {
    const raw = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isColorMode(raw) ? raw : DEFAULT_COLOR_MODE;
  } catch {
    return DEFAULT_COLOR_MODE;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandTheme>(DEFAULT_BRAND_THEME);
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const nextBrand = readStoredBrand();
    const nextMode = readStoredMode();
    setBrandState(nextBrand);
    setModeState(nextMode);
    applyThemeToDocument(nextBrand, nextMode);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(brand, mode);
    try {
      localStorage.setItem(BRAND_THEME_STORAGE_KEY, brand);
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore quota / private mode */
    }
    window.dispatchEvent(
      new CustomEvent('buildcon:themechange', { detail: { brand, mode } })
    );
  }, [brand, mode, hydrated]);

  const setBrand = useCallback((next: BrandTheme) => {
    applyThemeToDocument(next, mode);
    setBrandState(next);
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => {
    applyThemeToDocument(brand, next);
    setModeState(next);
  }, [brand]);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(brand, next);
      return next;
    });
  }, [brand]);

  const value = useMemo(
    () => ({ brand, mode, setBrand, setMode, toggleMode }),
    [brand, mode, setBrand, setMode, toggleMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
