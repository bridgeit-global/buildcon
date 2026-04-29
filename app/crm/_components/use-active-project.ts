'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CrmProject } from './types';

const LS_KEY = 'buildcon_active_project_id';

export function useActiveProject(projects: CrmProject[]) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (saved && projects.some((p) => p.id === saved)) {
      setActiveProjectId(saved);
      setHydrated(true);
      return;
    }
    // First login / new device behavior:
    // - If user has exactly 1 accessible project, auto-select it.
    // - If user has multiple projects, force explicit selection via UI.
    if (projects.length === 1) {
      const only = projects[0]!.id;
      setActiveProjectId(only);
      localStorage.setItem(LS_KEY, only);
      setHydrated(true);
      return;
    }
    setActiveProjectId(null);
    setHydrated(true);
  }, [projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const setActive = (id: string) => {
    setActiveProjectId(id);
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id);
  };

  return { activeProjectId, activeProject, setActiveProjectId: setActive, hydrated };
}

