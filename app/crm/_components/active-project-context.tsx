'use client';

import { createContext, useContext } from 'react';
import type { CrmProject } from './types';

type ActiveProjectContextValue = {
  projects: CrmProject[];
  activeProjectId: string | null;
  activeProject: CrmProject | null;
  setActiveProjectId: (id: string) => void;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(
  null
);

export function ActiveProjectProvider({
  value,
  children
}: {
  value: ActiveProjectContextValue;
  children: React.ReactNode;
}) {
  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProjectContext() {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error('useActiveProjectContext must be used within provider');
  }
  return ctx;
}

