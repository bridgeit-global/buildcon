'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CrmProject } from './types';

const LS_KEY = 'buildcon_active_project_id';

export function useActiveProject(projects: CrmProject[]) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (saved && projects.some((p) => p.id === saved)) {
      setActiveProjectId(saved);
      return;
    }
    const first = projects[0]?.id ?? null;
    setActiveProjectId(first);
    if (first) localStorage.setItem(LS_KEY, first);
  }, [projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const setActive = (id: string) => {
    setActiveProjectId(id);
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id);
  };

  return { activeProjectId, activeProject, setActiveProjectId: setActive };
}

