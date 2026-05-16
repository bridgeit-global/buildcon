'use client';

import { createContext, useContext } from 'react';
import type { CrmProject } from './types';

type CrmProjectsContextValue = {
  projects: CrmProject[];
};

const CrmProjectsContext = createContext<CrmProjectsContextValue | null>(null);

export function CrmProjectsProvider({
  value,
  children
}: {
  value: CrmProjectsContextValue;
  children: React.ReactNode;
}) {
  return (
    <CrmProjectsContext.Provider value={value}>
      {children}
    </CrmProjectsContext.Provider>
  );
}

export function useCrmProjectsContext() {
  const ctx = useContext(CrmProjectsContext);
  if (!ctx) {
    throw new Error('useCrmProjectsContext must be used within CrmProjectsProvider');
  }
  return ctx;
}
