'use client';

import { create } from 'zustand';
import type { CrmProject } from '@/app/crm/_components/types';

type CrmProjectsStore = {
  projects: CrmProject[];
  setProjects: (projects: CrmProject[]) => void;
  /** Add a new project or merge fields into an existing one (e.g. after create/edit) so
   * project pickers across the CRM reflect the change without a full layout refetch. */
  upsertProject: (project: CrmProject) => void;
};

export const useCrmProjectsStore = create<CrmProjectsStore>((set) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
  upsertProject: (project) =>
    set((state) => {
      const idx = state.projects.findIndex((p) => p.id === project.id);
      if (idx === -1) {
        return { projects: [project, ...state.projects] };
      }
      const next = state.projects.slice();
      next[idx] = { ...next[idx], ...project };
      return { projects: next };
    })
}));
