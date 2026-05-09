'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useActiveProjectContext } from '../_components/active-project-context';
import { CrmProjectCard } from '../_components/crm-project-card';
import type { CrmProjectListItem } from '../_components/types';

export default function ProjectsPage() {
  const router = useRouter();
  const { activeProjectId, setActiveProjectId } = useActiveProjectContext();

  const [q, setQ] = useState('');
  const [projects, setProjects] = useState<CrmProjectListItem[]>([]);
  const [canCreateProject, setCanCreateProject] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/crm/projects', { method: 'GET' });
      const json = (await res.json()) as {
        projects?: CrmProjectListItem[];
        canCreateProject?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Failed to load projects');
      setProjects(json.projects ?? []);
      setCanCreateProject(json.canCreateProject === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => {
      const hay =
        `${p.name} ${p.location ?? ''} ${p.type} ${p.status} ${p.fy ?? ''} ${p.rera_no ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [projects, q]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[22px] font-bold text-slate-800">My Projects</div>
            <div className="text-xs text-slate-400">
              {loading
                ? 'Loading…'
                : `${filtered.length} project${filtered.length !== 1 ? 's' : ''} · click a card to open`}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-[200px] md:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects…"
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
            {canCreateProject ? (
              <Button
                onClick={() => router.push('/crm/projectsettings?create=1')}
                className="font-semibold"
              >
                + Create New Project
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <CrmProjectCard
            key={p.id}
            project={p}
            activeProjectId={activeProjectId}
            onOpen={() => {
              setActiveProjectId(p.id);
              router.push('/crm/dashboard');
            }}
            onEdit={() => {
              setActiveProjectId(p.id);
              router.push('/crm/projectsettings');
            }}
            onInventory={() => {
              setActiveProjectId(p.id);
              router.push('/crm/inventory');
            }}
            onSettings={() => {
              setActiveProjectId(p.id);
              router.push('/crm/projectsettings');
            }}
          />
        ))}

        {canCreateProject && !loading ? (
          <button
            type="button"
            onClick={() => router.push('/crm/projectsettings?create=1')}
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-slate-300 p-8 text-slate-400 transition-colors hover:border-blue-500 hover:text-blue-600"
          >
            <span className="mb-2 text-[32px] leading-none">+</span>
            <span className="text-xs font-semibold">Create New Project</span>
          </button>
        ) : null}
      </div>

      {!loading && filtered.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm font-semibold text-gray-900">No projects found</div>
          <div className="mt-1 text-sm text-gray-500">
            If you’re a normal user, ask an admin to add you to{' '}
            <code className="font-mono">project_members</code>. Super Admins can create a project from
            this page or <Link href="/crm/projectsettings" className="text-blue-600 underline">Project Settings</Link>.
          </div>
        </Card>
      ) : null}
    </div>
  );
}
