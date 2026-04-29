'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useActiveProjectContext } from '../_components/active-project-context';
import type { CrmProject } from '../_components/types';

function subtitle(p: CrmProject) {
  const bits = [p.type, p.status, `FY ${p.fy ?? '—'}`].filter(Boolean);
  return bits.join(' · ');
}

export default function SelectProjectPage() {
  const router = useRouter();
  const { projects, setActiveProjectId } = useActiveProjectContext();
  const [q, setQ] = useState('');

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
    <div className="mx-auto max-w-5xl">
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              Select a project
            </div>
            <div className="text-sm text-gray-500">
              Choose the project you want to work on. You can switch later from the sidebar.
            </div>
          </div>

          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search projects…"
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-5 text-gray-500" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {p.name}
                </div>
                <div className="mt-1 text-xs text-gray-500">{subtitle(p)}</div>
                {p.location ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <MapPin className="size-3.5 text-gray-400" />
                    <span className="truncate">{p.location}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => {
                  setActiveProjectId(p.id);
                  router.replace('/crm/dashboard');
                }}
              >
                Select
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {projects.length === 0 ? (
        <Card className="mt-4 p-6">
          <div className="text-sm font-semibold text-gray-900">
            No accessible projects
          </div>
          <div className="mt-1 text-sm text-gray-500">
            Ask an admin to add you to this project in <code className="font-mono">project_members</code>.
          </div>
        </Card>
      ) : null}
    </div>
  );
}

