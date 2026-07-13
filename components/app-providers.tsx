'use client';

import type { ReactNode } from 'react';
import NextTopLoader from 'nextjs-toploader';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <NextTopLoader
        color="var(--ds-primary-500)"
        height={3}
        showSpinner={false}
        shadow="0 0 10px var(--ds-primary-500),0 0 5px var(--ds-primary-500)"
      />
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
