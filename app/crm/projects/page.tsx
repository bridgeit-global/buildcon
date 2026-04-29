'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useActiveProjectContext } from '../_components/active-project-context';
import type { CrmProject } from '../_components/types';

function projectSubtitle(p: CrmProject) {
  const bits = [p.type, p.status, `FY ${p.fy ?? '—'}`].filter(Boolean);
  return bits.join(' · ');
}

export default function ProjectsPage() {
  const router = useRouter();
  const { setActiveProjectId } = useActiveProjectContext();

  const [q, setQ] = useState('');
  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/crm/projects', { method: 'GET' });
        const json = (await res.json()) as {
          projects?: CrmProject[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || 'Failed to load projects');
        if (!cancelled) setProjects(json.projects ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load projects');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Projects</div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading…' : `${projects.length} accessible project(s)`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects…"
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-gray-500" />
                  <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
                </div>
                <div className="mt-1 text-xs text-gray-500">{projectSubtitle(p)}</div>
                {p.location ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <MapPin className="size-3.5 text-gray-400" />
                    <span className="truncate">{p.location}</span>
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-gray-500">
                  Wings: {p.floors_per_wing} floors · {p.units_per_floor} units/floor
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setActiveProjectId(p.id);
                  router.push('/crm/dashboard');
                }}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveProjectId(p.id);
                  router.push('/crm/inventory');
                }}
              >
                Inventory
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveProjectId(p.id);
                  router.push('/crm/projectsettings');
                }}
              >
                Settings
              </Button>
              <Link
                href="/crm/users"
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-4 ml-auto self-center"
              >
                Manage access
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {!loading && filtered.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm font-semibold text-gray-900">No projects found</div>
          <div className="mt-1 text-sm text-gray-500">
            If you’re a normal user, ask an admin to add you to <code className="font-mono">project_members</code>.
            If you’re Super Admin, create a project from <code className="font-mono">Project Settings</code>.
          </div>
        </Card>
      ) : null}
    </div>
  );
}

