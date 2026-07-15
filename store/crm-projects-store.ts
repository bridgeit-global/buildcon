'use client';

import { create } from 'zustand';
import type { CrmProject } from '@/app/crm/_components/types';

type CrmProjectsStore = {
  projects: CrmProject[];
  setProjects: (projects: CrmProject[]) => void;
};

export const useCrmProjectsStore = create<CrmProjectsStore>((set) => ({
  projects: [],
  setProjects: (projects) => set({ projects })
}));
