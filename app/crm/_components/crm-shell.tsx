'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CRM_NAV } from './nav';
import type { CrmProject } from './types';
import { useActiveProject } from './use-active-project';
import { ActiveProjectProvider } from './active-project-context';
import { cn } from '@/lib/utils';

export function CrmShell({
  userEmail,
  projects,
  children
}: {
  userEmail: string | null;
  projects: CrmProject[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeProject, activeProjectId, setActiveProjectId, hydrated } =
    useActiveProject(projects);

  const showRehab =
    !activeProject || activeProject.type?.toLowerCase() !== 'greenfield';

  useEffect(() => {
    if (!hydrated) return;
    if (projects.length === 0) return;
    if (activeProjectId) return;
    if (pathname.startsWith('/crm/select-project')) return;
    router.replace('/crm/select-project');
  }, [hydrated, projects.length, activeProjectId, pathname, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen overflow-hidden">
        <aside className="w-[240px] shrink-0 bg-[#1B2B65] text-white flex flex-col">
          <div className="px-4 py-4 border-b border-white/10">
            <div className="text-sm font-semibold tracking-wide">BuildCon</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              Redevelopment CRM
            </div>
          </div>

          <div className="px-3 py-3 border-b border-white/10">
            <div className="text-[10px] font-semibold tracking-widest text-white/50 px-2">
              ACTIVE PROJECT
            </div>
            <div className="mt-2 rounded-lg bg-white/10 px-3 py-2">
              <div className="text-xs font-semibold">
                {activeProject?.name ?? 'No project'}
              </div>
              <div className="text-[10px] text-white/60">
                FY {activeProject?.fy ?? '—'}
              </div>
              <select
                value={activeProjectId ?? ''}
                onChange={(e) => setActiveProjectId(e.target.value)}
                className="mt-2 w-full rounded-md bg-white/15 px-2 py-1 text-[11px] text-white outline-none"
                disabled={projects.length === 0}
              >
                {projects.length === 0 ? (
                  <option value="">No accessible projects</option>
                ) : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-[10px] text-white/60">
                Switch project to change scope.
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-2">
            {CRM_NAV.filter((i) => (showRehab ? true : i.id !== 'rehab')).map(
              (item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-[13px]">{item.label}</span>
                  </Link>
                );
              }
            )}
          </nav>

          <div className="px-4 py-3 border-t border-white/10">
            <div className="text-xs text-white/80 truncate">{userEmail}</div>
            <Link
              href="/logout"
              className="mt-2 inline-block text-xs text-white/60 hover:text-white"
            >
              Sign out
            </Link>
          </div>
        </aside>

        <ActiveProjectProvider
          value={{ projects, activeProjectId, activeProject, setActiveProjectId }}
        >
          <main className="flex-1 overflow-y-auto">
            <div className="p-5">
              <div className="mb-4">
                <div className="text-lg font-semibold text-gray-900">
                  {CRM_NAV.find((n) => pathname.startsWith(n.href))?.label ??
                    'CRM'}
                </div>
                <div className="text-sm text-gray-500">
                  {activeProject?.name ?? '—'} · FY {activeProject?.fy ?? '—'}
                </div>
              </div>
              {children}
            </div>
          </main>
        </ActiveProjectProvider>
      </div>
    </div>
  );
}

